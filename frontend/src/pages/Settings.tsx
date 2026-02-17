import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Save, Plus, Edit2, ArrowLeft, Sparkles, Trash2, Upload, Layout, FileText, Database, Cpu } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { listDomainExperiences, createDomainExperience, updateDomainExperience, deleteDomainExperience, recomputeDomainEmbedding, getEmbedConfigFromStorage, ingestCreateDomainExperience, getLLMConfigFromStorage, listFrameworkTemplates, createFrameworkTemplate, updateFrameworkTemplate, deleteFrameworkTemplate, saveFrameworkTemplateFromProject, getProjects } from '@/api/client'

interface DomainItem {
  domain_id: number
  domain_number: string
  domain_name: string
  domain_description: string
  domain_experience_content: string
  user_id: number
  updated_time: string
  tags?: string[] | null
}

export default function Settings() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'llm'|'domain'|'template'>('llm')
  const [apiUrl, setApiUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [modelName, setModelName] = useState('')
  const [embeddingApiKey, setEmbeddingApiKey] = useState('')
  const [embeddingApiUrl, setEmbeddingApiUrl] = useState('')
  const [embeddingModelName, setEmbeddingModelName] = useState('')
  const [domains, setDomains] = useState<DomainItem[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [newDomain, setNewDomain] = useState({ domain_number: '', domain_name: '', domain_description: '', domain_experience_content: '' })
  const [newTagsText, setNewTagsText] = useState('')
  const [autoEmbedNew, setAutoEmbedNew] = useState(false)
  const [ingestFiles, setIngestFiles] = useState<FileList | null>(null)
  const [ingestLoading, setIngestLoading] = useState(false)
  const [ingestError, setIngestError] = useState<string | null>(null)
  const [ingestFileKey, setIngestFileKey] = useState(0)
  const [frameworkStrategy, setFrameworkStrategy] = useState('retrieval')
  const [autoEmbedMap, setAutoEmbedMap] = useState<Record<number, boolean>>({})
  const [templates, setTemplates] = useState<{ template_id: number; template_name: string; template_description?: string; template_content: string }[]>([])
  const [tplEditingId, setTplEditingId] = useState<number | null>(null)
  type TSlot = { slot_number: string; slot_key: string; is_necessary: boolean }
  type TTopic = { topic_number: string; topic_content: string; is_necessary: boolean; slots: TSlot[] }
  type TSection = { section_number: string; section_content: string; topics: TTopic[] }
  const [tplEditorSections, setTplEditorSections] = useState<TSection[]>([])
  const [tplEditorName, setTplEditorName] = useState('')
  const [tplEditorDesc, setTplEditorDesc] = useState('')
  const [tplCreateSections, setTplCreateSections] = useState<TSection[]>([])
  const [newTemplateMeta, setNewTemplateMeta] = useState({ template_name: '', template_description: '' })
  const [projects, setProjects] = useState<{ project_id: number; project_name: string }[]>([])
  const [tplSaveProjectId, setTplSaveProjectId] = useState<number | null>(null)
  const [tplSaveName, setTplSaveName] = useState('')
  const [tplSaveDesc, setTplSaveDesc] = useState('')

  const userRaw = localStorage.getItem('user')
  const user = userRaw ? JSON.parse(userRaw) : null
  const userId = user?.user_id as number | undefined

  useEffect(() => {
    setApiUrl(localStorage.getItem('llm_api_url') || '')
    setApiKey(localStorage.getItem('llm_api_key') || '')
    setModelName(localStorage.getItem('llm_model_name') || '')
    setEmbeddingApiKey(localStorage.getItem('embedding_api_key') || '')
    setEmbeddingApiUrl(localStorage.getItem('embedding_api_url') || '')
    setEmbeddingModelName(localStorage.getItem('embedding_model_name') || '')
    setFrameworkStrategy(localStorage.getItem('framework_selection_strategy') || 'retrieval')
    ;(async () => {
      const data = await listDomainExperiences(userId)
      setDomains(data.domains)
      const ts = await listFrameworkTemplates(userId) as { templates: { template_id: number; template_name: string; template_description?: string; template_content: string }[] }
      setTemplates(ts.templates || [])
      const ps = await getProjects() as { projects: { project_id: number; project_name: string }[] }
      setProjects(ps.projects.map((p) => ({ project_id: p.project_id, project_name: p.project_name })))
    })()
  }, [userId])

  const saveLLM = () => {
    localStorage.setItem('llm_api_url', apiUrl)
    localStorage.setItem('llm_api_key', apiKey)
    localStorage.setItem('llm_model_name', modelName)
    localStorage.setItem('embedding_api_key', embeddingApiKey)
    localStorage.setItem('embedding_api_url', embeddingApiUrl)
    localStorage.setItem('embedding_model_name', embeddingModelName)
    localStorage.setItem('framework_selection_strategy', frameworkStrategy)
  }

  const saveNewDomain = async () => {
    if (!newDomain.domain_number || !newDomain.domain_name) return
    const tagsArray = newTagsText.trim() ? newTagsText.split(',').map(t => t.trim()).filter(t => t.length > 0) : undefined
    const res = await createDomainExperience({ ...newDomain, user_id: userId, tags: tagsArray })
    const id = res.domain_id as number | undefined
    setNewDomain({ domain_number: '', domain_name: '', domain_description: '', domain_experience_content: '' })
    setNewTagsText('')
    if (autoEmbedNew && id) {
      const embed = getEmbedConfigFromStorage()
      if (embed) await recomputeDomainEmbedding(id, embed.api_key, embed.api_url, embed.model_name)
    }
    const data = await listDomainExperiences(userId)
    setDomains(data.domains)
  }

  const saveDomain = async (item: DomainItem) => {
    await updateDomainExperience(item.domain_id, {
      domain_number: item.domain_number,
      domain_name: item.domain_name,
      domain_description: item.domain_description,
      domain_experience_content: item.domain_experience_content,
      tags: item.tags ?? null,
    })
    if (autoEmbedMap[item.domain_id]) {
      const embed = getEmbedConfigFromStorage()
      if (embed) await recomputeDomainEmbedding(item.domain_id, embed.api_key, embed.api_url, embed.model_name)
      const data = await listDomainExperiences(userId)
      setDomains(data.domains)
    }
    setEditingId(null)
  }

  return (
    <div className="min-h-screen bg-background text-foreground animate-in fade-in duration-500">
      <div className="container mx-auto max-w-5xl p-6 lg:p-10 space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button 
              aria-label="返回" 
              onClick={() => navigate(-1)} 
              className="p-2 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight flex items-center">
                <SettingsIcon className="h-8 w-8 mr-3 text-primary" />
                系统设置
              </h1>
              <p className="text-muted-foreground">配置 LLM 参数、管理领域知识库与框架模板</p>
            </div>
          </div>
          {activeTab === 'llm' && (
            <button 
              onClick={saveLLM} 
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 px-8"
            >
              <Save className="h-4 w-4 mr-2" />
              保存配置
            </button>
          )}
        </div>

        <div className="flex space-x-1 bg-muted/50 p-1 rounded-lg w-fit">
          {[
            { id: 'llm', label: 'LLM 配置', icon: Cpu },
            { id: 'domain', label: '领域知识库', icon: Database },
            { id: 'template', label: '框架模板', icon: Layout },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'llm'|'domain'|'template')}
              className={`
                flex items-center px-4 py-2 text-sm font-medium rounded-md transition-all
                ${activeTab === tab.id 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
                }
              `}
            >
              <tab.icon className="h-4 w-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bg-card text-card-foreground rounded-xl border shadow-sm p-6 min-h-[500px]">
          {activeTab === 'llm' ? (
            <div className="max-w-2xl space-y-6">
              <div className="grid gap-4">
                <h3 className="text-lg font-medium leading-none border-b pb-2">基础模型配置</h3>
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">API URL</label>
                  <input 
                    value={apiUrl} 
                    onChange={e => setApiUrl(e.target.value)} 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="e.g. https://api.openai.com/v1"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">API Key</label>
                  <input 
                    type="password"
                    value={apiKey} 
                    onChange={e => setApiKey(e.target.value)} 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="sk-..."
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Model Name</label>
                  <input 
                    value={modelName} 
                    onChange={e => setModelName(e.target.value)} 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="e.g. gpt-4"
                  />
                </div>
              </div>

              <div className="grid gap-4 pt-4">
                <h3 className="text-lg font-medium leading-none border-b pb-2">Embedding 模型配置</h3>
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Embedding API URL</label>
                  <input 
                    value={embeddingApiUrl} 
                    onChange={e => setEmbeddingApiUrl(e.target.value)} 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Embedding API Key</label>
                  <input 
                    type="password"
                    value={embeddingApiKey} 
                    onChange={e => setEmbeddingApiKey(e.target.value)} 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Embedding Model Name</label>
                  <input 
                    value={embeddingModelName} 
                    onChange={e => setEmbeddingModelName(e.target.value)} 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="grid gap-4 pt-4">
                <h3 className="text-lg font-medium leading-none border-b pb-2">策略配置</h3>
                <div className="grid gap-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">框架选择方案</label>
                  <select 
                    value={frameworkStrategy} 
                    onChange={e => setFrameworkStrategy(e.target.value)} 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="retrieval">检索融合 (Retrieval)</option>
                    <option value="prompt">提示选择 (Prompt Selection)</option>
                  </select>
                </div>
              </div>
            </div>
          ) : activeTab === 'domain' ? (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                  <div className="p-6 space-y-4">
                    <div className="flex items-center space-x-2">
                      <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <FileText className="h-5 w-5" />
                      </div>
                      <h3 className="font-semibold leading-none tracking-tight">手动创建领域经验</h3>
                    </div>
                    <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-2 gap-4">
                        <input placeholder="编号 (e.g. domain-1)" value={newDomain.domain_number} onChange={e => setNewDomain({ ...newDomain, domain_number: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                        <input placeholder="名称" value={newDomain.domain_name} onChange={e => setNewDomain({ ...newDomain, domain_name: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                      </div>
                      <input placeholder="描述" value={newDomain.domain_description} onChange={e => setNewDomain({ ...newDomain, domain_description: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                      <textarea placeholder="经验内容..." value={newDomain.domain_experience_content} onChange={e => setNewDomain({ ...newDomain, domain_experience_content: e.target.value })} className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" />
                      <input placeholder="标签 (逗号分隔)" value={newTagsText} onChange={e => setNewTagsText(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <label className="text-sm text-muted-foreground flex items-center cursor-pointer hover:text-foreground transition-colors">
                        <input type="checkbox" checked={autoEmbedNew} onChange={e => setAutoEmbedNew(e.target.checked)} className="mr-2 h-4 w-4 rounded border-primary text-primary focus:ring-primary" />
                        自动生成向量
                      </label>
                      <button onClick={saveNewDomain} className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2">
                        <Plus className="h-4 w-4 mr-2" />添加
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                  <div className="p-6 space-y-4">
                    <div className="flex items-center space-x-2">
                      <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-600">
                        <Upload className="h-5 w-5" />
                      </div>
                      <h3 className="font-semibold leading-none tracking-tight">反向总结领域经验</h3>
                    </div>
                    <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-2 gap-4">
                        <input placeholder="编号 (e.g. domain-1)" value={newDomain.domain_number} onChange={e => setNewDomain({ ...newDomain, domain_number: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                        <input placeholder="名称" value={newDomain.domain_name} onChange={e => setNewDomain({ ...newDomain, domain_name: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                      </div>
                      <input placeholder="描述 (可选)" value={newDomain.domain_description} onChange={e => setNewDomain({ ...newDomain, domain_description: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                      
                      <div className="flex items-center justify-center w-full">
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted transition-colors border-muted-foreground/25">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <Upload className="w-8 h-8 mb-3 text-muted-foreground" />
                            <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold">点击上传</span> 或拖拽文件</p>
                            <p className="text-xs text-muted-foreground">TXT, MD, HTML, PDF, DOCX, JSON, CSV</p>
                          </div>
                          <input key={ingestFileKey} type="file" multiple accept=".txt,.md,.html,.htm,.docx,.pdf,.json,.csv" onChange={e => { setIngestFiles(e.target.files); setIngestError(null) }} className="hidden" />
                        </label>
                      </div>
                      
                      {ingestFiles && ingestFiles.length > 0 && (
                        <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                          已选择: {Array.from(ingestFiles).map(f => `${f.name} (${Math.round(f.size/1024)} KB)`).join('，')}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <label className="text-sm text-muted-foreground flex items-center cursor-pointer hover:text-foreground transition-colors">
                        <input type="checkbox" checked={autoEmbedNew} onChange={e => setAutoEmbedNew(e.target.checked)} className="mr-2 h-4 w-4 rounded border-primary text-primary focus:ring-primary" />
                        生成后自动向量化
                      </label>
                      <button 
                        disabled={ingestLoading || !newDomain.domain_number || !newDomain.domain_name || !ingestFiles || ingestFiles.length === 0} 
                        onClick={async () => {
                          setIngestError(null)
                          const llm = getLLMConfigFromStorage(); const embed = getEmbedConfigFromStorage(); if (!llm || !embed || !userId) return
                          setIngestLoading(true)
                          const fd = new FormData()
                          fd.append('user_id', String(userId))
                          fd.append('domain_number', newDomain.domain_number)
                          fd.append('domain_name', newDomain.domain_name)
                          fd.append('domain_description', newDomain.domain_description)
                          fd.append('llm_api_url', llm.api_url)
                          fd.append('llm_api_key', llm.api_key)
                          fd.append('llm_model_name', llm.model_name)
                          fd.append('embed_api_url', embed.api_url)
                          fd.append('embed_api_key', embed.api_key)
                          fd.append('embed_model_name', embed.model_name)
                          Array.from(ingestFiles).forEach(f => fd.append('files', f))
                          try {
                            await ingestCreateDomainExperience(fd)
                            const data = await listDomainExperiences(userId)
                            setDomains(data.domains)
                            alert('生成成功')
                            setIngestFiles(null)
                            setNewDomain({ domain_number: '', domain_name: '', domain_description: '', domain_experience_content: '' })
                            setIngestFileKey(k => k + 1)
                          } catch {
                            setIngestError('上传或生成失败，请稍后重试')
                          } finally {
                            setIngestLoading(false)
                          }
                        }} 
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-emerald-600 text-white shadow hover:bg-emerald-700 h-9 px-4 py-2"
                      >
                        {ingestLoading ? '处理中...' : '上传并生成'}
                      </button>
                    </div>
                    {ingestError && (<div className="text-xs text-red-500 font-medium">{ingestError}</div>)}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium">已存领域经验 ({domains.length})</h3>
                <div className="grid grid-cols-1 gap-4">
                  {domains.map(item => (
                    <div key={item.domain_id} className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden transition-all hover:shadow-md">
                      {editingId === item.domain_id ? (
                        <div className="p-6 space-y-4 bg-muted/30">
                          <div className="grid grid-cols-3 gap-4">
                            <input value={item.domain_number} onChange={e => setDomains(ds => ds.map(d => d.domain_id === item.domain_id ? { ...d, domain_number: e.target.value } : d))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                            <input value={item.domain_name} onChange={e => setDomains(ds => ds.map(d => d.domain_id === item.domain_id ? { ...d, domain_name: e.target.value } : d))} className="col-span-2 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                          </div>
                          <input value={item.domain_description} onChange={e => setDomains(ds => ds.map(d => d.domain_id === item.domain_id ? { ...d, domain_description: e.target.value } : d))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                          <textarea value={item.domain_experience_content} onChange={e => setDomains(ds => ds.map(d => d.domain_id === item.domain_id ? { ...d, domain_experience_content: e.target.value } : d))} className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                          <input value={(item.tags || []).join(',')} onChange={e => setDomains(ds => ds.map(d => d.domain_id === item.domain_id ? { ...d, tags: e.target.value.split(',').map(t => t.trim()).filter(t => t.length>0) } : d))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" placeholder="标签，逗号分隔" />
                          
                          <div className="flex items-center justify-between pt-2">
                            <label className="text-sm text-muted-foreground flex items-center cursor-pointer">
                              <input type="checkbox" checked={!!autoEmbedMap[item.domain_id]} onChange={e => setAutoEmbedMap(m => ({ ...m, [item.domain_id]: e.target.checked }))} className="mr-2 h-4 w-4 rounded border-primary text-primary focus:ring-primary" />
                              自动生成向量
                            </label>
                            <div className="space-x-2">
                              <button onClick={() => saveDomain(item)} className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2">
                                <Save className="h-4 w-4 mr-2" />保存
                              </button>
                              <button onClick={async () => { const embed = getEmbedConfigFromStorage(); if (!embed) return; await recomputeDomainEmbedding(item.domain_id, embed.api_key, embed.api_url, embed.model_name); const data = await listDomainExperiences(userId); setDomains(data.domains) }} className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-teal-600 text-white shadow hover:bg-teal-700 h-9 px-4 py-2">
                                <Sparkles className="h-4 w-4 mr-2" />计算嵌入
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-6 flex items-start justify-between group">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{item.domain_number}</span>
                              <span className="font-semibold text-lg">{item.domain_name}</span>
                            </div>
                            <div className="text-sm text-muted-foreground max-w-2xl">{item.domain_description}</div>
                            {(item.tags || []).length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-2">
                                {(item.tags || []).map((tag, i) => (
                                  <span key={i} className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 text-foreground">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            <button onClick={() => setEditingId(item.domain_id)} className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 w-8">
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button onClick={async () => { if (confirm('确认删除此领域经验？')) { await deleteDomainExperience(item.domain_id); const data = await listDomainExperiences(userId); setDomains(data.domains) } }} className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background shadow-sm hover:bg-destructive/10 hover:text-destructive h-8 w-8">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                  <div className="p-6 space-y-4">
                    <div className="flex items-center space-x-2">
                      <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <Layout className="h-5 w-5" />
                      </div>
                      <h3 className="font-semibold leading-none tracking-tight">手动创建模板</h3>
                    </div>
                    
                    <div className="space-y-4 pt-2">
                      <input placeholder="模板名称" value={newTemplateMeta.template_name} onChange={e => setNewTemplateMeta({ ...newTemplateMeta, template_name: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                      <input placeholder="模板描述 (可选)" value={newTemplateMeta.template_description} onChange={e => setNewTemplateMeta({ ...newTemplateMeta, template_description: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                    </div>

                    <div className="bg-muted/40 rounded-lg p-4 space-y-4 border">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-muted-foreground">模板结构</div>
                        <button onClick={() => setTplCreateSections(secs => [...secs, { section_number: `section-${secs.length+1}`, section_content: '', topics: [] }])} className="inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-7 px-3">
                          <Plus className="h-3 w-3 mr-1" />添加章节
                        </button>
                      </div>
                      
                      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {tplCreateSections.map((sec, sIdx) => (
                          <div key={`sec-${sIdx}`} className="rounded-lg border bg-background p-3 shadow-sm animate-in fade-in slide-in-from-top-2">
                            <div className="flex items-center gap-2 mb-3">
                              <input placeholder="编号" value={sec.section_number} onChange={e => setTplCreateSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, section_number: e.target.value } : x))} className="w-24 h-8 rounded-md border border-input bg-transparent px-2 text-xs focus:ring-1 focus:ring-primary" />
                              <input placeholder="章节内容" value={sec.section_content} onChange={e => setTplCreateSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, section_content: e.target.value } : x))} className="flex-1 h-8 rounded-md border border-input bg-transparent px-2 text-xs focus:ring-1 focus:ring-primary" />
                              <button onClick={() => setTplCreateSections(ss => ss.filter((_,i)=> i!==sIdx))} className="h-8 w-8 rounded-md text-destructive hover:bg-destructive/10 flex items-center justify-center transition-colors"><Trash2 className="h-4 w-4" /></button>
                            </div>
                            
                            <div className="pl-4 border-l-2 border-muted space-y-3 ml-1">
                              {sec.topics.map((tp, tIdx) => (
                                <div key={`tp-${sIdx}-${tIdx}`} className="bg-muted/30 rounded-md p-2 border border-border/50">
                                  <div className="flex items-center gap-2 mb-2">
                                    <input placeholder="编号" value={tp.topic_number} onChange={e => setTplCreateSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, topics: x.topics.map((y,j)=> j===tIdx ? { ...y, topic_number: e.target.value } : y) } : x))} className="w-24 h-7 rounded border border-input bg-background px-2 text-xs focus:ring-1 focus:ring-primary" />
                                    <input placeholder="主题内容" value={tp.topic_content} onChange={e => setTplCreateSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, topics: x.topics.map((y,j)=> j===tIdx ? { ...y, topic_content: e.target.value } : y) } : x))} className="flex-1 h-7 rounded border border-input bg-background px-2 text-xs focus:ring-1 focus:ring-primary" />
                                    <label className="text-xs flex items-center gap-1 px-2 cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors"><input type="checkbox" checked={tp.is_necessary} onChange={e => setTplCreateSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, topics: x.topics.map((y,j)=> j===tIdx ? { ...y, is_necessary: e.target.checked } : y) } : x))} className="rounded border-primary text-primary focus:ring-primary h-3.5 w-3.5" /><span>必要</span></label>
                                    <button onClick={() => setTplCreateSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, topics: x.topics.filter((_,j)=> j!==tIdx) } : x))} className="h-7 w-7 rounded hover:bg-destructive/10 text-destructive flex items-center justify-center transition-colors"><Trash2 className="h-3 w-3" /></button>
                                  </div>
                                  
                                  <div className="space-y-1 pl-2">
                                    {tp.slots.map((sl, rIdx) => (
                                      <div key={`sl-${sIdx}-${tIdx}-${rIdx}`} className="flex items-center gap-2 group">
                                        <span className="text-muted-foreground text-xs">↳</span>
                                        <input placeholder="编号" value={sl.slot_number} onChange={e => setTplCreateSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, topics: x.topics.map((y,j)=> j===tIdx ? { ...y, slots: y.slots.map((z,k)=> k===rIdx ? { ...z, slot_number: e.target.value } : z) } : y) } : x))} className="w-20 h-6 rounded border border-input bg-background px-2 text-[10px] focus:ring-1 focus:ring-primary" />
                                        <input placeholder="Key" value={sl.slot_key} onChange={e => setTplCreateSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, topics: x.topics.map((y,j)=> j===tIdx ? { ...y, slots: y.slots.map((z,k)=> k===rIdx ? { ...z, slot_key: e.target.value } : z) } : y) } : x))} className="flex-1 h-6 rounded border border-input bg-background px-2 text-[10px] focus:ring-1 focus:ring-primary" />
                                        <button onClick={() => setTplCreateSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, topics: x.topics.map((y,j)=> j===tIdx ? { ...y, slots: y.slots.filter((_,k)=> k!==rIdx) } : y) } : x))} className="h-6 w-6 text-destructive hover:bg-destructive/10 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X className="h-3 w-3" /></button>
                                      </div>
                                    ))}
                                    <button onClick={() => setTplCreateSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, topics: x.topics.map((y,j)=> j===tIdx ? { ...y, slots: [...y.slots, { slot_number: `${tp.topic_number}-${(tp.slots.length+1)}`, slot_key: '', is_necessary: false }] } : y) } : x))} className="text-[10px] text-primary hover:underline pl-4 pt-1 flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity"><Plus className="h-3 w-3" />添加槽位</button>
                                  </div>
                                </div>
                              ))}
                              <button onClick={() => setTplCreateSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, topics: [...x.topics, { topic_number: `${sec.section_number}-${(x.topics.length+1)}`, topic_content: '', is_necessary: true, slots: [] }] } : x))} className="text-xs text-primary hover:underline flex items-center gap-1 py-1"><Plus className="h-3 w-3" />添加主题</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-end space-x-3 pt-2">
                      <button onClick={() => setTplCreateSections([])} className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                        清空
                      </button>
                      <button 
                        onClick={async () => {
                          if (!userId || !newTemplateMeta.template_name || tplCreateSections.length === 0) return
                          const content = JSON.stringify(tplCreateSections)
                          await createFrameworkTemplate({ template_name: newTemplateMeta.template_name, template_description: newTemplateMeta.template_description, template_content: content, user_id: userId })
                          const ts = await listFrameworkTemplates(userId) as { templates: { template_id: number; template_name: string; template_description?: string; template_content: string }[] }
                          setTemplates(ts.templates || [])
                          setNewTemplateMeta({ template_name: '', template_description: '' })
                          setTplCreateSections([])
                        }} 
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        创建模板
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-card text-card-foreground shadow-sm h-fit">
                  <div className="p-6 space-y-4">
                    <div className="flex items-center space-x-2">
                      <div className="p-2 bg-blue-500/10 rounded-lg text-blue-600">
                        <Save className="h-5 w-5" />
                      </div>
                      <h3 className="font-semibold leading-none tracking-tight">从项目保存为模板</h3>
                    </div>
                    <div className="space-y-4 pt-2">
                      <div className="grid gap-2">
                        <label className="text-sm font-medium leading-none">选择来源项目</label>
                        <select value={tplSaveProjectId ?? ''} onChange={e => setTplSaveProjectId(e.target.value ? Number(e.target.value) : null)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                          <option value="">请选择项目...</option>
                          {projects.map(p => (<option key={p.project_id} value={p.project_id}>{p.project_name}</option>))}
                        </select>
                      </div>
                      <input placeholder="模板名称" value={tplSaveName} onChange={e => setTplSaveName(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                      <input placeholder="模板描述 (可选)" value={tplSaveDesc} onChange={e => setTplSaveDesc(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                      
                      <div className="flex justify-end pt-2">
                        <button 
                          disabled={!tplSaveProjectId || !tplSaveName} 
                          onClick={async () => { if (!tplSaveProjectId || !tplSaveName) return; await saveFrameworkTemplateFromProject(tplSaveProjectId, tplSaveName, tplSaveDesc); const ts = await listFrameworkTemplates(userId); setTemplates(ts.templates || []); setTplSaveProjectId(null); setTplSaveName(''); setTplSaveDesc('') }} 
                          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
                        >
                          保存模板
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium">已有模板 ({templates.length})</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map(t => (
                    <div key={t.template_id} className="rounded-xl border bg-card text-card-foreground shadow-sm hover:shadow-md transition-all flex flex-col">
                      <div className="p-5 flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold truncate" title={t.template_name}>{t.template_name}</h4>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-3 mb-4">{t.template_description || '无描述'}</p>
                      </div>
                      <div className="p-4 bg-muted/30 border-t flex items-center justify-between">
                        <button 
                          onClick={async () => { 
                            setTplEditingId(t.template_id); 
                            setTplEditorName(t.template_name);
                            setTplEditorDesc(t.template_description || '');
                            try { const arr = JSON.parse(t.template_content) as TSection[]; setTplEditorSections(arr) } catch { setTplEditorSections([]) } 
                          }} 
                          className="text-xs font-medium hover:underline flex items-center"
                        >
                          <Edit2 className="h-3 w-3 mr-1" />编辑
                        </button>
                        <button 
                          onClick={async () => { if(confirm('确认删除?')) { await deleteFrameworkTemplate(t.template_id); const ts = await listFrameworkTemplates(userId) as { templates: { template_id: number; template_name: string; template_description?: string; template_content: string }[] }; setTemplates(ts.templates || []) } }} 
                          className="text-xs font-medium text-destructive hover:underline flex items-center"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />删除
                        </button>
                      </div>
                      
                      {/* Simple Overlay Editor for Template (could be a dialog in a larger app) */}
                      {tplEditingId === t.template_id && (
                        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                          <div className="bg-card text-card-foreground w-full max-w-3xl max-h-[90vh] border rounded-xl shadow-lg flex flex-col animate-in zoom-in-95 duration-200">
                            <div className="p-4 border-b flex items-center justify-between">
                              <h3 className="font-semibold">编辑模板: {t.template_name}</h3>
                              <button onClick={() => { setTplEditingId(null); setTplEditorSections([]) }} className="p-2 hover:bg-muted rounded-full transition-colors"><X className="h-5 w-5" /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                <div className="space-y-3 mb-4 border-b pb-4">
                                  <div className="grid gap-2">
                                    <label className="text-sm font-medium">模板名称</label>
                                    <input 
                                      value={tplEditorName} 
                                      onChange={e => setTplEditorName(e.target.value)} 
                                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" 
                                    />
                                  </div>
                                  <div className="grid gap-2">
                                    <label className="text-sm font-medium">模板描述</label>
                                    <input 
                                      value={tplEditorDesc} 
                                      onChange={e => setTplEditorDesc(e.target.value)} 
                                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" 
                                    />
                                  </div>
                                </div>
                                <div className="space-y-4">
                                  <div className="flex justify-end">
                                     <button onClick={() => setTplEditorSections(secs => [...secs, { section_number: `section-${secs.length+1}`, section_content: '', topics: [] }])} className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors font-medium flex items-center"><Plus className="h-3 w-3 mr-1" />添加章节</button>
                                  </div>
                                  {tplEditorSections.map((sec, sIdx) => (
                                    <div key={`edit-sec-${sIdx}`} className="rounded-lg border bg-background p-3 shadow-sm animate-in fade-in slide-in-from-top-2">
                                      <div className="flex items-center gap-2 mb-3">
                                        <input placeholder="编号" value={sec.section_number} onChange={e => setTplEditorSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, section_number: e.target.value } : x))} className="w-24 h-8 rounded-md border border-input bg-transparent px-2 text-xs focus:ring-1 focus:ring-primary" />
                                        <input placeholder="章节内容" value={sec.section_content} onChange={e => setTplEditorSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, section_content: e.target.value } : x))} className="flex-1 h-8 rounded-md border border-input bg-transparent px-2 text-xs focus:ring-1 focus:ring-primary" />
                                        <button onClick={() => setTplEditorSections(ss => ss.filter((_,i)=> i!==sIdx))} className="h-8 w-8 rounded-md text-destructive hover:bg-destructive/10 flex items-center justify-center transition-colors"><Trash2 className="h-4 w-4" /></button>
                                      </div>
                                      
                                      <div className="pl-4 border-l-2 border-muted space-y-3 ml-1">
                                        {sec.topics.map((tp, tIdx) => (
                                          <div key={`edit-tp-${sIdx}-${tIdx}`} className="bg-muted/30 rounded-md p-2 border border-border/50">
                                            <div className="flex items-center gap-2 mb-2">
                                              <input placeholder="编号" value={tp.topic_number} onChange={e => setTplEditorSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, topics: x.topics.map((y,j)=> j===tIdx ? { ...y, topic_number: e.target.value } : y) } : x))} className="w-24 h-7 rounded border border-input bg-background px-2 text-xs focus:ring-1 focus:ring-primary" />
                                              <input placeholder="主题内容" value={tp.topic_content} onChange={e => setTplEditorSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, topics: x.topics.map((y,j)=> j===tIdx ? { ...y, topic_content: e.target.value } : y) } : x))} className="flex-1 h-7 rounded border border-input bg-background px-2 text-xs focus:ring-1 focus:ring-primary" />
                                              <label className="text-xs flex items-center gap-1 px-2 cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors"><input type="checkbox" checked={tp.is_necessary} onChange={e => setTplEditorSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, topics: x.topics.map((y,j)=> j===tIdx ? { ...y, is_necessary: e.target.checked } : y) } : x))} className="rounded border-primary text-primary focus:ring-primary h-3.5 w-3.5" /><span>必要</span></label>
                                              <button onClick={() => setTplEditorSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, topics: x.topics.filter((_,j)=> j!==tIdx) } : x))} className="h-7 w-7 rounded hover:bg-destructive/10 text-destructive flex items-center justify-center transition-colors"><Trash2 className="h-3 w-3" /></button>
                                            </div>
                                            
                                            <div className="space-y-1 pl-2">
                                              {tp.slots.map((sl, rIdx) => (
                                                <div key={`edit-sl-${sIdx}-${tIdx}-${rIdx}`} className="flex items-center gap-2 group">
                                                  <span className="text-muted-foreground text-xs">↳</span>
                                                  <input placeholder="编号" value={sl.slot_number} onChange={e => setTplEditorSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, topics: x.topics.map((y,j)=> j===tIdx ? { ...y, slots: y.slots.map((z,k)=> k===rIdx ? { ...z, slot_number: e.target.value } : z) } : y) } : x))} className="w-20 h-6 rounded border border-input bg-background px-2 text-[10px] focus:ring-1 focus:ring-primary" />
                                                  <input placeholder="Key" value={sl.slot_key} onChange={e => setTplEditorSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, topics: x.topics.map((y,j)=> j===tIdx ? { ...y, slots: y.slots.map((z,k)=> k===rIdx ? { ...z, slot_key: e.target.value } : z) } : y) } : x))} className="flex-1 h-6 rounded border border-input bg-background px-2 text-[10px] focus:ring-1 focus:ring-primary" />
                                                  <button onClick={() => setTplEditorSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, topics: x.topics.map((y,j)=> j===tIdx ? { ...y, slots: y.slots.filter((_,k)=> k!==rIdx) } : y) } : x))} className="h-6 w-6 text-destructive hover:bg-destructive/10 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X className="h-3 w-3" /></button>
                                                </div>
                                              ))}
                                              <button onClick={() => setTplEditorSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, topics: x.topics.map((y,j)=> j===tIdx ? { ...y, slots: [...y.slots, { slot_number: `${tp.topic_number}-${(tp.slots.length+1)}`, slot_key: '', is_necessary: false }] } : y) } : x))} className="text-[10px] text-primary hover:underline pl-4 pt-1 flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity"><Plus className="h-3 w-3" />添加槽位</button>
                                            </div>
                                          </div>
                                        ))}
                                        <button onClick={() => setTplEditorSections(ss => ss.map((x,i)=> i===sIdx ? { ...x, topics: [...x.topics, { topic_number: `${sec.section_number}-${(x.topics.length+1)}`, topic_content: '', is_necessary: true, slots: [] }] } : x))} className="text-xs text-primary hover:underline flex items-center gap-1 py-1"><Plus className="h-3 w-3" />添加主题</button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                            </div>
                            <div className="p-4 border-t flex justify-end space-x-2">
                                <button onClick={() => { setTplEditingId(null); setTplEditorSections([]) }} className="px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">取消</button>
                                <button onClick={async () => { await updateFrameworkTemplate(t.template_id, { template_name: tplEditorName, template_description: tplEditorDesc, template_content: JSON.stringify(tplEditorSections) }); const ts = await listFrameworkTemplates(userId); setTemplates(ts.templates || []); setTplEditingId(null); setTplEditorSections([]); setTplEditorName(''); setTplEditorDesc(''); }} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">保存更改</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function X({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18"/>
      <path d="m6 6 18 18"/>
    </svg>
  )
}
