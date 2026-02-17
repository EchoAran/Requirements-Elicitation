import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Settings, Sparkles, MessageSquare, CheckCircle, Loader2, RefreshCcw, ArrowLeft, Send, Bot, User } from 'lucide-react'
import { createProject, getProjects, getLLMConfigFromStorage, evaluateEntropy, metaInterviewNext, listFrameworkTemplates, initializeProjectWithTemplate, getConfigValues, retrievalSuggestFromText, retrievalFuseGlobal, createAndInitializeProject } from '@/api/client'
import Sidebar, { SidebarProject } from '@/components/Sidebar'
import { CustomConfirmModal } from '@/components/ui/CustomConfirmModal'

export default function NewProject() {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [initialDesc, setInitialDesc] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingText, setLoadingText] = useState<string>('')
  
  const [projects, setProjects] = useState<SidebarProject[]>([])
  const [entropy, setEntropy] = useState<number | null>(null)
  const [semanticScore, setSemanticScore] = useState<number | null>(null)
  const [lengthScore, setLengthScore] = useState<number | null>(null)
  const [summary, setSummary] = useState<{ core_goal?: string; core_users?: string[]; core_functions?: string[]; constraints?: string[]; acceptance?: string[] } | null>(null)
  const [coverage, setCoverage] = useState<{ goal?: string; users?: string; functions?: string; constraints?: string; acceptance?: string } | null>(null)
  const [phase, setPhase] = useState<'create' | 'review'>('create')
  const [showMeta, setShowMeta] = useState(false)
  const [projectInfo, setProjectInfo] = useState('')
  const [retrievalOpen, setRetrievalOpen] = useState(false)
  const [retrievalCandidates, setRetrievalCandidates] = useState<{ domain_id: number; domain_name: string; tags: string[]; matched_tags: string[]; tag_score: number; cosine: number; weight: number }[]>([])
  const [retrievalThresholdUsed, setRetrievalThresholdUsed] = useState<number | null>(null)
  const [retrievalTopKUsed, setRetrievalTopKUsed] = useState<number | null>(null)
  const [retrievalLoading, setRetrievalLoading] = useState(false)
  const [retrievalError, setRetrievalError] = useState<string | null>(null)
  const [generatingFramework, setGeneratingFramework] = useState(false)
  const [templates, setTemplates] = useState<{ template_id: number; template_name: string }[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  
  const [metaHistory, setMetaHistory] = useState<{ role: string; content: string }[]>([])
  const [userReply, setUserReply] = useState('')
  const [entropyThresholdUsed, setEntropyThresholdUsed] = useState<number | null>(null)
  const [metaBusy, setMetaBusy] = useState(false)
  const [metaStopped, setMetaStopped] = useState(false)
  
  // Modal states
  const [showEnoughEntropyModal, setShowEnoughEntropyModal] = useState(false)
  const [showLowEntropyModal, setShowLowEntropyModal] = useState(false)

  const navigate = useNavigate()

  useEffect(() => {
    (async () => {
      try {
        const cfg = await getConfigValues()
        setEntropyThresholdUsed((cfg.entropy_threshold ?? null) as number | null)
        setRetrievalThresholdUsed((cfg.retrieval_cosine_threshold ?? null) as number | null)
        setRetrievalTopKUsed((cfg.retrieval_top_k ?? null) as number | null)
      } catch (e) {
        console.error('加载系统配置失败', e)
        setError('系统配置加载失败')
      }
      const data = await getProjects()
      setProjects(data.projects)
      const userRaw = localStorage.getItem('user')
      const user = userRaw ? JSON.parse(userRaw) as { user_id?: number } : null
      const userId = user?.user_id as number | undefined
      const ts = await listFrameworkTemplates(userId) as { templates: { template_id: number; template_name: string }[] }
      setTemplates(ts.templates || [])
      const savedName = localStorage.getItem('new_project_name')
      const savedDesc = localStorage.getItem('new_project_desc')
      const savedInitialDesc = localStorage.getItem('new_project_initial_desc')
      const savedProjectInfo = localStorage.getItem('new_project_projectInfo')
      const savedSummary = localStorage.getItem('new_project_summary')
      const savedMetaHistory = localStorage.getItem('new_project_meta_history')
      if (savedName) setName(savedName)
      if (savedDesc) setDesc(savedDesc)
      if (savedInitialDesc) setInitialDesc(savedInitialDesc)
      if (savedProjectInfo) setProjectInfo(savedProjectInfo)
      if (savedSummary) {
        setSummary(JSON.parse(savedSummary))
      }
      if (savedMetaHistory) {
        setMetaHistory(JSON.parse(savedMetaHistory))
      }
    })()
  }, [])

  const defaultTemplate = '核心目标：\n- \n\n核心用户：\n- \n\n核心功能：\n- \n\n关键约束（时间/预算/技术/合规）：\n- \n\n验收标准（可度量）：\n- '

  const fillTemplate = () => {
    setDesc(d => d && d.trim().length > 0 ? d : defaultTemplate)
  }

  const runQualityCheck = async () => {
    if (!name || !desc) return
    setLoading(true)
    setLoadingText('正在计算信息丰富度...')
    setError(null)
    try {
      if (!initialDesc) setInitialDesc(desc)
      const cfg = getLLMConfigFromStorage()
      if (!cfg) throw new Error('LLM未配置，请在设置中填写')
      // Step 2: 整理信息（先基于初始描述生成摘要）
      const res1 = await evaluateEntropy(cfg, desc)
      const s1 = res1.summary || null
      // Step 3: 计算信息熵（对摘要文本进行评分）
      const formatted = summaryToText(s1)
      const res2 = await evaluateEntropy(cfg, formatted)
      setEntropy(res2.entropy as number)
      setSemanticScore(res2.semantic_score as number)
      setLengthScore(res2.length_score as number)
      setCoverage(res2.coverage || null)
      setEntropyThresholdUsed((res2.threshold ?? null) as number | null)
      const revisedSummary = res2.summary
      setSummary(revisedSummary)
      setProjectInfo(summaryToText(revisedSummary))
      // 进入评审阶段：先仅显示质检容器；若信息熵低则自动进入元访谈
      setPhase('review')
      const usedThr = (res2.threshold ?? entropyThresholdUsed) as number | null
      const low = usedThr !== null ? ((res2.entropy as number) < usedThr) : false
      setShowMeta(low)
      if (low) await kickoffMeta(revisedSummary as typeof summary, res2.coverage as typeof coverage)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '计算失败，请检查LLM配置'
      setError(msg)
    }
    setLoading(false)
    setLoadingText('')
  }

  const kickoffMeta = async (latestSummary?: typeof summary, latestCoverage?: typeof coverage) => {
    const cfg = getLLMConfigFromStorage()
    if (!cfg) return
    const usedThr = entropyThresholdUsed
    if (entropy !== null && usedThr !== null && entropy >= usedThr) return
    const res = await metaInterviewNext(
      cfg,
      (latestSummary ?? summary) || { core_goal: '', core_users: [], core_functions: [], constraints: [], acceptance: [] },
      (latestCoverage ?? coverage) || { goal: '未覆盖', users: '未覆盖', functions: '未覆盖', constraints: '未覆盖', acceptance: '未覆盖' },
      [],
      projectInfo || desc
    )
    setMetaHistory([{ role: 'assistant', content: res.next_question || '' }])
  }

  const sendMetaReply = async () => {
    if (metaStopped) return
    if (!userReply.trim()) return
    const cfg = getLLMConfigFromStorage()
    if (!cfg) return
    setMetaBusy(true)
    const nextHistory = [...metaHistory, { role: 'user', content: userReply.trim() }]
    setMetaHistory(nextHistory)
    setUserReply('')
    await new Promise(resolve => setTimeout(resolve, 0))
    try {
      const res = await metaInterviewNext(
        cfg,
        summary || { core_goal: '', core_users: [], core_functions: [], constraints: [], acceptance: [] },
        coverage || { goal: '未覆盖', users: '未覆盖', functions: '未覆盖', constraints: '未覆盖', acceptance: '未覆盖' },
        nextHistory,
        projectInfo || desc
      )
      const prevSummaryText = summaryToText(summary)
      const conversationText = nextHistory.map(m => `${m.role === 'user' ? '用户' : '系统'}：${m.content}`).join('\n')
      const combined = `${prevSummaryText}\n\n对话补充：\n${conversationText}`
      const qc = await evaluateEntropy(cfg, combined)
      const newEntropy = qc.entropy as number
      setEntropy(newEntropy)
      setSemanticScore(qc.semantic_score as number)
      setLengthScore(qc.length_score as number)
      setCoverage(qc.coverage || null)
      setEntropyThresholdUsed((qc.threshold ?? null) as number | null)
      const syncedSummary = (qc.summary || null) as typeof summary
      setSummary(syncedSummary)
      setProjectInfo(summaryToText(syncedSummary || null))
      setPhase('review')
      const usedThr2 = (qc.threshold ?? entropyThresholdUsed) as number | null
      const enough = usedThr2 !== null ? (newEntropy >= usedThr2) : false
      setShowMeta(!enough)
      if (enough) {
        setMetaStopped(true)
        setShowEnoughEntropyModal(true)
      } else {
        setMetaHistory([...nextHistory, { role: 'assistant', content: res.next_question || '' }])
      }
    } finally {
      setMetaBusy(false)
    }
  }

  const summaryToText = (s: typeof summary) => {
    if (!s) return desc
    const goal = s.core_goal || ''
    const users = (s.core_users || []).map(x => `- ${x}`).join('\n')
    const funcs = (s.core_functions || []).map(x => `- ${x}`).join('\n')
    const cons = (s.constraints || []).map(x => `- ${x}`).join('\n')
    const acc = (s.acceptance || []).map(x => `- ${x}`).join('\n')
    return `核心目标：\n${goal}\n\n核心用户：\n${users}\n\n核心功能：\n${funcs}\n\n关键约束：\n${cons}\n\n验收标准：\n${acc}`
  }

  const executeCreate = async () => {
    if (retrievalOpen || generatingFramework) return
    const finalDesc = summaryToText(summary)
    const strategy = localStorage.getItem('framework_selection_strategy') || 'retrieval'
    const cfg = getLLMConfigFromStorage()
    if (!cfg) { setError('LLM未配置，请在设置中填写'); return }
    if (selectedTemplateId) {
      setLoading(true)
      setLoadingText('正在创建项目...')
      setError(null)
      const res = await createProject(name, finalDesc)
      const newId = (res && (res.project?.project_id ?? res.project_id ?? res.id)) as number | undefined
      if (newId) {
        try {
          await initializeProjectWithTemplate(newId, selectedTemplateId)
          setLoading(false)
          setLoadingText('')
          navigate('/')
          return
        } catch (e) {
          const msg = e instanceof Error ? e.message : '使用模板初始化失败'
          setError(msg)
        }
      }
      setLoading(false)
      setLoadingText('')
      return
    }
    if (strategy === 'retrieval') {
      setLoading(false)
      setLoadingText('')
      await openRetrieval()
      return
    } else {
      setLoading(true)
      setLoadingText('正在生成访谈框架...')
      setError(null)
      try {
        const resp = await createAndInitializeProject(name, finalDesc, cfg, '')
        const newId = (resp && (resp.project?.project_id ?? resp.project_id ?? resp.id)) as number | undefined
        if (newId) localStorage.setItem('selectedProjectId', String(newId))
        navigate('/')
      } catch (e) {
        const msg = e instanceof Error ? e.message : '框架创建失败，请检查LLM配置'
        setError(msg)
      }
      setLoading(false)
      setLoadingText('')
    }
  }

  const confirmAndCreate = async () => {
    if (retrievalOpen || generatingFramework) return
    const usedThr = entropyThresholdUsed
    if (showMeta && entropy !== null && usedThr !== null && entropy < usedThr) {
      setShowLowEntropyModal(true)
      return
    }
    await executeCreate()
  }

  const handleCreateClick = async () => {
    if (selectedTemplateId) {
      if (!name || !desc) return
      setLoading(true)
      setLoadingText('正在创建项目...')
      setError(null)
      const res = await createProject(name, desc)
      const newId = (res && (res.project?.project_id ?? res.project_id ?? res.id)) as number | undefined
      if (newId) {
        try {
          await initializeProjectWithTemplate(newId, selectedTemplateId)
          setLoading(false)
          setLoadingText('')
          navigate('/')
          return
        } catch (e) {
          const msg = e instanceof Error ? e.message : '使用模板初始化失败'
          setError(msg)
        }
      }
      setLoading(false)
      setLoadingText('')
    } else {
      await runQualityCheck()
    }
  }

  const openRetrieval = async () => {
    setRetrievalOpen(true)
    setRetrievalLoading(true)
    setRetrievalError(null)
    setRetrievalCandidates([])
    const api_url = localStorage.getItem('embedding_api_url') || ''
    const api_key = localStorage.getItem('embedding_api_key') || ''
    const model_name = localStorage.getItem('embedding_model_name') || ''
    const user_id = null
    const qtext = projectInfo || summaryToText(summary)
    try {
      const res = await retrievalSuggestFromText(qtext, { api_url, api_key, model_name }, retrievalThresholdUsed ?? undefined, retrievalTopKUsed ?? undefined, user_id)
      setRetrievalThresholdUsed((res.threshold_used ?? null) as number | null)
      setRetrievalTopKUsed((res.top_k_used ?? null) as number | null)
      type RetrievalCandidate = { domain_id: number; domain_name: string; tags: string[]; matched_tags: string[]; tag_score: number; cosine: number; weight: number }
      const cands: RetrievalCandidate[] = (res.candidates || []) as RetrievalCandidate[]
      const total = cands.reduce((acc: number, c: RetrievalCandidate) => acc + (c.weight || 0), 0)
      if (total > 0.00001) {
        cands.forEach((c: RetrievalCandidate) => c.weight = (c.weight || 0) / total)
      } else if (cands.length > 0) {
        const w = 1.0 / cands.length
        cands.forEach((c: RetrievalCandidate) => c.weight = w)
      }
      setRetrievalCandidates(cands)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '检索失败'
      setRetrievalError(msg)
    }
    setRetrievalLoading(false)
  }

  const recomputeRetrieval = async () => {
    setRetrievalLoading(true)
    setRetrievalError(null)
    const api_url = localStorage.getItem('embedding_api_url') || ''
    const api_key = localStorage.getItem('embedding_api_key') || ''
    const model_name = localStorage.getItem('embedding_model_name') || ''
    const qtext = projectInfo || summaryToText(summary)
    try {
      const res = await retrievalSuggestFromText(qtext, { api_url, api_key, model_name }, retrievalThresholdUsed ?? undefined, retrievalTopKUsed ?? undefined)
      setRetrievalThresholdUsed((res.threshold_used ?? null) as number | null)
      setRetrievalTopKUsed((res.top_k_used ?? null) as number | null)
      type RetrievalCandidate = { domain_id: number; domain_name: string; tags: string[]; matched_tags: string[]; tag_score: number; cosine: number; weight: number }
      const cands: RetrievalCandidate[] = (res.candidates || []) as RetrievalCandidate[]
      const total = cands.reduce((acc: number, c: RetrievalCandidate) => acc + (c.weight || 0), 0)
      if (total > 0.00001) {
        cands.forEach((c: RetrievalCandidate) => c.weight = (c.weight || 0) / total)
      } else if (cands.length > 0) {
        const w = 1.0 / cands.length
        cands.forEach((c: RetrievalCandidate) => c.weight = w)
      }
      setRetrievalCandidates(cands)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '检索失败'
      setRetrievalError(msg)
    }
    setRetrievalLoading(false)
  }

  const finalizeCreation = async (fused_text: string) => {
    const cfg = getLLMConfigFromStorage()
    if (!cfg) { setRetrievalError('LLM未配置，请在设置中填写'); return }
    const finalDesc = summaryToText(summary)
    try {
      const thr = retrievalThresholdUsed
      const dids = (retrievalCandidates || [])
        .filter(c => (thr === null ? true : (typeof c.cosine === 'number' && c.cosine >= (thr as number))))
        .map(c => c.domain_id)
      const resp = await createAndInitializeProject(name, finalDesc, cfg, fused_text, undefined, dids)
      const newId = (resp && (resp.project?.project_id ?? resp.project_id ?? resp.id)) as number | undefined
      if (newId) localStorage.setItem('selectedProjectId', String(newId))
      setRetrievalOpen(false)
      navigate('/')
    } catch (e) {
      const msg = e instanceof Error ? e.message : '生成失败'
      setRetrievalError(msg)
    }
  }

  const generateWithFused = async () => {
    setGeneratingFramework(true)
    setRetrievalError(null)
    try {
      const items = retrievalCandidates.map(c => ({ domain_id: c.domain_id, weight: c.weight }))
      const cfg = getLLMConfigFromStorage()
      const fr = await retrievalFuseGlobal(items, cfg || undefined)
      const fused_text = String(fr.fused_text || '')
      await finalizeCreation(fused_text)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '生成失败'
      setRetrievalError(msg)
    }
    setGeneratingFramework(false)
  }

  const generateWithoutFused = async () => {
    setGeneratingFramework(true)
    setRetrievalError(null)
    try {
      await finalizeCreation('')
    } finally {
      setGeneratingFramework(false)
    }
  }

  // Persist creation states
  useEffect(() => { localStorage.setItem('new_project_name', name) }, [name])
  useEffect(() => { localStorage.setItem('new_project_desc', desc) }, [desc])
  useEffect(() => { localStorage.setItem('new_project_initial_desc', initialDesc) }, [initialDesc])
  useEffect(() => { localStorage.setItem('new_project_projectInfo', projectInfo) }, [projectInfo])
  useEffect(() => { localStorage.setItem('new_project_summary', JSON.stringify(summary || {})) }, [summary])
  useEffect(() => { localStorage.setItem('new_project_meta_history', JSON.stringify(metaHistory)) }, [metaHistory])

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative bg-card rounded-xl shadow-xl border border-border w-[360px] p-6 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"></div>
            <div className="text-sm text-muted-foreground font-medium">{loadingText || '处理中...'}</div>
          </div>
        </div>
      )}

      <Sidebar
        projects={projects}
        selectedProject={null}
        onProjectSelect={(p) => {
          localStorage.setItem('selectedProjectId', String(p.project_id));
          navigate('/');
        }}
        onNewProject={() => navigate('/projects/new')}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background/50">
        {/* Header */}
        <div className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-6 justify-between flex-shrink-0 z-10">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate('/')} className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold">创建新项目</h1>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`h-2 w-2 rounded-full ${phase === 'create' ? 'bg-primary' : 'bg-muted-foreground'}`} />
            <div className={`h-1 w-8 rounded-full ${phase === 'review' ? 'bg-primary' : 'bg-muted'}`} />
            <div className={`h-2 w-2 rounded-full ${phase === 'review' ? 'bg-primary' : 'bg-muted-foreground'}`} />
          </div>
        </div>

        <div className="flex-1 p-6 overflow-hidden flex justify-center">
          {phase === 'create' ? (
            <div className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-card rounded-xl border border-border shadow-sm h-full max-h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
                <div className="p-6 border-b border-border flex items-center justify-between bg-muted/10">
                  <div className="flex items-center space-x-3">
                    <div className="bg-primary/10 p-2 rounded-lg">
                      <Settings className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-foreground">项目基础信息</h2>
                      <p className="text-xs text-muted-foreground">填写项目名称和描述，或使用模板快速开始</p>
                    </div>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {error && (
                    <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm flex items-start">
                      <span className="mr-2">⚠️</span> {error}
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">项目名称</label>
                    <input 
                      value={name} 
                      onChange={e => setName(e.target.value)} 
                      placeholder="给项目起个名字..." 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">使用模板（可选）</label>
                    <select 
                      value={selectedTemplateId ?? ''} 
                      onChange={e => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)} 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="">不使用模板</option>
                      {templates.map(t => (<option key={t.template_id} value={t.template_id}>{t.template_name}</option>))}
                    </select>
                    {selectedTemplateId && (
                      <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded border border-border">
                        💡 选择的模板将直接作为访谈框架。
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2 flex-1 flex flex-col min-h-[200px]">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-foreground">项目内容描述</label>
                      <button 
                        type="button" 
                        onClick={fillTemplate} 
                        className="text-xs flex items-center text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded hover:bg-primary/10"
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        填充通用格式
                      </button>
                    </div>
                    <textarea 
                      value={desc} 
                      onChange={e => setDesc(e.target.value)} 
                      placeholder="请详细描述项目的核心目标、用户群体、功能需求等..." 
                      rows={18}
                      className="flex-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none leading-relaxed"
                    />
                  </div>
                </div>
                
                <div className="p-6 border-t border-border bg-muted/10 flex items-center justify-end space-x-3">
                  <button 
                    disabled={loading} 
                    onClick={() => navigate('/')} 
                    className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    type="button" 
                    onClick={handleCreateClick} 
                    disabled={loading || !name || !desc} 
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 shadow-sm transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {selectedTemplateId ? '创建项目' : '下一步'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className={`grid ${showMeta ? 'grid-cols-2' : 'grid-cols-1'} gap-6 w-full max-w-[1600px] h-full max-h-[calc(100vh-8rem)]`}>
              {/* Meta Interview Chat - Left Side when active */}
              {showMeta && (
                <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col overflow-hidden animate-in fade-in slide-in-from-left-4 duration-500">
                  <div className="p-4 border-b border-border bg-primary/5 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <MessageSquare className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold text-foreground">AI 需求分析师</h3>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Meta Interview</span>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/10">
                    {metaHistory.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`flex max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center mt-1 shadow-sm ${
                            msg.role === 'user' ? 'bg-primary ml-2' : 'bg-card border border-border mr-2'
                          }`}>
                            {msg.role === 'user' ? <User className="h-4 w-4 text-primary-foreground" /> : <Bot className="h-4 w-4 text-primary" />}
                          </div>
                          <div className={`rounded-xl px-4 py-3 shadow-sm text-sm leading-relaxed ${
                            msg.role === 'user' 
                              ? 'bg-primary text-primary-foreground rounded-tr-none' 
                              : 'bg-card text-foreground border border-border rounded-tl-none'
                          }`}>
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    ))}
                    {metaBusy && (
                      <div className="flex justify-start">
                         <div className="flex flex-row">
                           <div className="shrink-0 h-8 w-8 rounded-full bg-card border border-border flex items-center justify-center mr-2 mt-1">
                             <Bot className="h-4 w-4 text-primary" />
                           </div>
                           <div className="bg-card border border-border rounded-xl rounded-tl-none px-4 py-3 shadow-sm flex items-center space-x-1">
                             <div className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                             <div className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                             <div className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" />
                           </div>
                         </div>
                      </div>
                    )}
                  </div>

                  <div className="p-4 border-t border-border bg-card">
                    <div className="flex space-x-2">
                      <input 
                        value={userReply} 
                        onChange={e => setUserReply(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMetaReply()}
                        placeholder="回答 AI 的提问，补充需求细节..."
                        className="flex-1 rounded-full border border-input bg-background px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        disabled={metaBusy || metaStopped}
                      />
                      <button 
                        onClick={sendMetaReply} 
                        disabled={!userReply.trim() || metaBusy || metaStopped}
                        className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Quality Report - Right Side (or Center) */}
              <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-500">
                <div className="p-4 border-b border-border flex items-center justify-between bg-muted/10">
                  <div className="flex items-center space-x-2">
                      <CheckCircle className={`h-5 w-5 ${(entropy !== null && entropyThresholdUsed !== null && entropy < entropyThresholdUsed) ? 'text-yellow-500' : 'text-green-500'}`} />
                    <div className="font-semibold text-foreground">需求信息丰富度计算报告</div>
                  </div>
                  <div className="text-xs font-mono bg-background border border-border px-2 py-1 rounded text-muted-foreground">
                    阈值: {entropyThresholdUsed ?? '-'}
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6">
                  {entropy === null ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p>正在生成报告...</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Score Cards */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 rounded-lg bg-muted/30 border border-border text-center">
                          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">信息熵</div>
                          <div className={`text-2xl font-bold ${(entropy !== null && entropyThresholdUsed !== null && entropy < entropyThresholdUsed) ? 'text-yellow-600' : 'text-green-600'}`}>
                            {entropy.toFixed(3)}
                          </div>
                        </div>
                        <div className="p-4 rounded-lg bg-muted/30 border border-border text-center">
                          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">语义完整度</div>
                          <div className="text-2xl font-bold text-foreground">{semanticScore}</div>
                        </div>
                        <div className="p-4 rounded-lg bg-muted/30 border border-border text-center">
                          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">内容长度</div>
                          <div className="text-2xl font-bold text-foreground">{Math.round((lengthScore||0)*100)}%</div>
                        </div>
                      </div>

                      {/* Content Preview */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">结构化需求预览</label>
                        <div className="bg-muted/20 border border-border rounded-lg p-4 text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed font-mono min-h-[300px] max-h-[500px] overflow-y-auto custom-scrollbar">
                          {summary ? summaryToText(summary) : projectInfo}
                        </div>
                      </div>

                      {/* Alert for low entropy */}
                      {(entropy !== null && entropyThresholdUsed !== null && entropy < entropyThresholdUsed) && (
                        <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/50 flex items-start space-x-3">
                          <Sparkles className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5 shrink-0" />
                          <div>
                            <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-400">建议优化</h4>
                            <p className="text-xs text-yellow-700 dark:text-yellow-500/80 mt-1">
                              需求信息量较低，建议通过左侧的 AI 访谈补充更多细节，以提高生成框架的质量。
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="p-4 border-t border-border bg-muted/10 flex items-center justify-end space-x-3">
                  <button 
                    onClick={confirmAndCreate} 
                    disabled={loading || retrievalOpen || generatingFramework} 
                    className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium inline-flex items-center shadow-sm"
                  >
                    {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                    确认并创建项目
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Retrieval Overlay (Keep mostly as is but style) */}
      {retrievalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-card border border-border shadow-2xl rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
             <div className="p-6 border-b border-border flex justify-between items-center">
               <h3 className="text-lg font-semibold">领域经验检索与融合</h3>
               <button onClick={() => setRetrievalOpen(false)} className="text-muted-foreground hover:text-foreground">
                 <Plus className="h-6 w-6 rotate-45" />
               </button>
             </div>
             <div className="p-6 overflow-y-auto flex-1 space-y-4">
               {retrievalError && <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">{retrievalError}</div>}
               {retrievalLoading ? (
                 <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
               ) : (
                 <div className="space-y-4">
                   <div className="flex justify-between items-center bg-muted/30 p-3 rounded-lg">
                    <span className="text-sm text-muted-foreground">检索阈值: {retrievalThresholdUsed ?? '-'} / TopK: {retrievalTopKUsed ?? '-'}</span>
                     <button onClick={recomputeRetrieval} className="text-sm text-primary hover:underline flex items-center"><RefreshCcw className="h-3 w-3 mr-1"/>重新检索</button>
                   </div>
                   {retrievalCandidates.length === 0 ? (
                     <div className="text-center py-10 text-muted-foreground">未找到相似领域经验，将直接生成访谈框架。</div>
                   ) : (
                     <div className="grid gap-3">
                       {retrievalCandidates.map((c, i) => (
                         <div key={i} className="border border-border rounded-lg p-4 hover:bg-muted/20 transition-colors">
                           <div className="flex justify-between mb-2">
                             <span className="font-medium">{c.domain_name}</span>
                             <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">匹配度 {(c.cosine * 100).toFixed(0)}%</span>
                           </div>
                           <div className="flex flex-wrap gap-1 mb-2">
                             {c.tags.map(t => <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded border ${c.matched_tags.includes(t) ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900' : 'bg-muted text-muted-foreground border-transparent'}`}>{t}</span>)}
                           </div>
                           <div className="flex items-center space-x-3 mt-3 pt-3 border-t border-border/50">
                             <span className="text-xs font-medium text-muted-foreground">融合权重:</span>
                             <input 
                              type="range" 
                              min="0" 
                              max="1.0" 
                              step="0.01" 
                              value={c.weight} 
                              onChange={e => {
                                const val = Math.max(0, Math.min(1, parseFloat(e.target.value)))
                                setRetrievalCandidates(prev => {
                                  const next = prev.map(p => ({ ...p }))
                                  
                                  if (next.length === 1) {
                                    next[i].weight = 1.0
                                    return next
                                  }

                                  next[i].weight = val
                                  
                                  const targetSumOthers = 1.0 - val
                                  const currentSumOthers = next.reduce((sum, p, idx) => idx === i ? sum : sum + p.weight, 0)
                                  
                                  if (currentSumOthers > 0.00001) {
                                    const ratio = targetSumOthers / currentSumOthers
                                    next.forEach((p, idx) => {
                                      if (idx !== i) {
                                        p.weight = Math.max(0, p.weight * ratio)
                                      }
                                    })
                                  } else {
                                    const distribute = targetSumOthers / (next.length - 1)
                                    next.forEach((p, idx) => {
                                      if (idx !== i) {
                                        p.weight = distribute
                                      }
                                    })
                                  }
                                  
                                  return next
                                })
                              }}
                              className="flex-1 h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                            />
                             <span className="text-xs font-mono w-8 text-right">{c.weight.toFixed(2)}</span>
                           </div>
                         </div>
                       ))}
                     </div>
                   )}
                 </div>
               )}
             </div>
             <div className="p-6 border-t border-border bg-muted/10 flex justify-end space-x-3">
              <button onClick={generateWithoutFused} disabled={generatingFramework} className="px-4 py-2 border border-border rounded-md text-sm hover:bg-accent">跳过融合</button>
              <button onClick={generateWithFused} disabled={generatingFramework} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 flex items-center">
                {generatingFramework && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                融合生成框架
              </button>
            </div>
           </div>
        </div>
      )}
      {/* Modals */}
      <CustomConfirmModal
        isOpen={showEnoughEntropyModal}
        title="信息量达标"
        message="信息量已达标，可以直接创建项目。是否立即创建？"
        onConfirm={async () => {
          setShowEnoughEntropyModal(false)
          await executeCreate()
        }}
        onCancel={() => setShowEnoughEntropyModal(false)}
      />
      <CustomConfirmModal
        isOpen={showLowEntropyModal}
        title="信息量较低"
        message="当前信息量较低，跳过元访谈可能影响框架质量。是否直接开始检索领域经验？"
        confirmText="继续创建"
        variant="warning"
        onConfirm={async () => {
          setShowLowEntropyModal(false)
          await executeCreate()
        }}
        onCancel={() => setShowLowEntropyModal(false)}
      />
    </div>
  )
}
