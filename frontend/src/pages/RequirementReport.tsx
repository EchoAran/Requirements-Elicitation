import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProjects, getProjectDetail, regenerateReport, updateProject, downloadReport, downloadChat, downloadSlots, getLLMConfigFromStorage, getEmbedConfigFromStorage } from '@/api/client'
import Sidebar from '@/components/Sidebar'
import { RefreshCw, Edit2, Save, X, Download, FileText, MessageSquare, Database, ArrowLeft } from 'lucide-react'
import MarkdownIt from 'markdown-it'
import mermaid from 'mermaid'

interface ProjectBrief { project_id: number; project_name: string; initial_requirements: string; project_status: string; created_at: string }
interface Project { project_id: number; project_name: string; initial_requirements: string; project_status: string; interview_report?: string }

export default function RequirementReport() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const pid = Number(projectId)
  const [project, setProject] = useState<Project | null>(null)
  const [projects, setProjects] = useState<ProjectBrief[]>([])
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState('')
  const [html, setHtml] = useState('')
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [regenLoading, setRegenLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const mdRef = useRef<MarkdownIt | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const plist = await getProjects()
      setProjects(plist.projects)
      const p = plist.projects.find((x: ProjectBrief) => x.project_id === pid)
      if (p) {
        const detail = await getProjectDetail(pid)
        const content = detail.project.interview_report || ''
        setProject({ ...p, interview_report: content })
        setReport(content)
        if (!mdRef.current) {
          mdRef.current = new MarkdownIt({ html: true, linkify: true })
          mdRef.current.enable(['table'])
        }
        const rendered = mdRef.current.render(content)
        setHtml(rendered)
      } else {
        setProject(null)
      }
    } finally {
      setLoading(false)
    }
  }, [pid])

  useEffect(() => { if (!Number.isNaN(pid)) { load() } }, [load, pid])

  useEffect(() => {
    if (!html || editing) return
    
    const renderMermaid = async () => {
      try { mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'base' }) } catch (err) { void err }
      
      // Process all mermaid code blocks
      const codes = document.querySelectorAll('pre code.language-mermaid')
      if (codes.length === 0 && document.querySelectorAll('.mermaid').length === 0) return

      codes.forEach(code => {
        const pre = code.parentElement
        const container = document.createElement('div')
        container.className = 'mermaid flex justify-center my-6 p-4 bg-muted/20 rounded-lg border border-border/50 overflow-x-auto'
        container.textContent = code.textContent || ''
        if (pre && pre.parentElement) pre.parentElement.replaceChild(container, pre)
      })

      const els = document.querySelectorAll<HTMLDivElement>('.mermaid')
      for (let i = 0; i < els.length; i++) {
        const el = els[i]
        // Skip if already rendered (contains svg)
        if (el.querySelector('svg')) continue

        const code = el.textContent || ''
        try {
          const { svg } = await mermaid.render(`mmd-${i}-${Date.now()}`, code)
          el.innerHTML = svg
        } catch {
          el.innerHTML = `<div class="flex flex-col items-center justify-center p-4 border border-destructive/30 rounded-lg bg-destructive/5 text-destructive space-y-2"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg><span class="text-sm font-medium">Mermaid Diagram Error</span></div>`
        }
      }
    }

    // Use a small timeout to ensure DOM is ready after innerHTML update
    const timer = setTimeout(renderMermaid, 100)
    return () => clearTimeout(timer)
  }, [html, editing])

  const busy = loading || regenLoading || saveLoading

  const handleRegenerate = async () => {
    if (!project) return
    setRegenLoading(true)
    const llm = getLLMConfigFromStorage()
    const embed = getEmbedConfigFromStorage()
    try {
      const resp = await regenerateReport(pid, llm || null, embed || null)
      const content = String((resp && resp.interview_report) || '')
      setReport(content)
      if (!mdRef.current) {
        mdRef.current = new MarkdownIt({ html: true, linkify: true })
        mdRef.current.enable(['table'])
      }
      const rendered = mdRef.current.render(content)
      setHtml(rendered)
      await load()
    } finally {
      setRegenLoading(false)
    }
  }

  const handleStartEdit = () => {
    setEditText(report)
    setEditing(true)
  }

  const handleSaveEdit = async () => {
    if (!project) return
    setSaveLoading(true)
    await updateProject(pid, { interview_report: editText })
    setEditing(false)
    await load()
    setSaveLoading(false)
  }

  const handleCancelEdit = () => {
    setEditing(false)
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    try {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Blob download error:', e)
      alert('保存文件失败')
    }
  }

  const handleDownloadReport = async () => {
    console.log('Downloading report...')
    try {
      const blob = await downloadReport(pid)
      console.log('Report blob received:', blob)
      const name = (project?.project_name || 'project').replace(/[\\/:*?"<>|]/g, '_')
      downloadBlob(blob, `${name}-report.md`)
      setDownloadOpen(false)
    } catch (err) {
      console.error('Download failed', err)
      alert('下载失败')
    }
  }

  const handleDownloadChat = async () => {
    try {
      const blob = await downloadChat(pid)
      const name = (project?.project_name || 'project').replace(/[\\/:*?"<>|]/g, '_')
      downloadBlob(blob, `${name}-chat.json`)
      setDownloadOpen(false)
    } catch (err) {
      console.error('Download failed', err)
      alert('下载失败')
    }
  }

  const handleDownloadSlots = async () => {
    try {
      const blob = await downloadSlots(pid)
      const name = (project?.project_name || 'project').replace(/[\\/:*?"<>|]/g, '_')
      downloadBlob(blob, `${name}-slots.json`)
      setDownloadOpen(false)
    } catch (err) {
      console.error('Download failed', err)
      alert('下载失败')
    }
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden animate-in fade-in duration-500">
      <Sidebar
        projects={projects}
        selectedProject={projects.find(p => p.project_id === pid) || null}
        onProjectSelect={(p) => {
          if (busy) return;
          localStorage.setItem('selectedProjectId', String(p.project_id));
          navigate('/');
        }}
        onNewProject={() => {
          if (busy) return;
          navigate('/projects/new');
        }}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Header */}
        <div className={`h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 flex items-center justify-between shrink-0 ${downloadOpen ? 'z-50' : 'z-10'}`}>
            <div className="flex items-center space-x-4">
                <button 
                    onClick={() => { localStorage.setItem('selectedProjectId', String(pid)); navigate('/') }} 
                    className="p-2 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    title="返回看板"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="h-6 w-px bg-border mx-2" />
                <div>
                    <h1 className="font-semibold text-lg leading-none">{project?.project_name}</h1>
                    <p className="text-xs text-muted-foreground mt-1">需求分析报告</p>
                </div>
            </div>

            {project?.project_status === 'Completed' && (
                <div className="flex items-center space-x-2">
                    <button 
                        disabled={busy} 
                        onClick={handleRegenerate} 
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-3"
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${regenLoading ? 'animate-spin' : ''}`} />
                        重新生成
                    </button>
                    
                    {!editing ? (
                        <button 
                            disabled={busy} 
                            onClick={handleStartEdit} 
                            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-3"
                        >
                            <Edit2 className="h-4 w-4 mr-2" />
                            编辑
                        </button>
                    ) : (
                        <div className="flex items-center space-x-2">
                            <button 
                                disabled={busy} 
                                onClick={handleSaveEdit} 
                                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-3"
                            >
                                {saveLoading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin"/> : <Save className="h-4 w-4 mr-2" />}
                                保存
                            </button>
                            <button 
                                disabled={busy} 
                                onClick={handleCancelEdit} 
                                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-3"
                            >
                                <X className="h-4 w-4 mr-2" />
                                取消
                            </button>
                        </div>
                    )}

                    <div className="relative ml-2">
                        <button 
                            disabled={busy} 
                            onClick={() => { console.log('Toggle download menu', !downloadOpen); setDownloadOpen(!downloadOpen) }} 
                            className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-3 ${downloadOpen ? 'bg-accent text-accent-foreground' : ''}`}
                        >
                            <Download className="h-4 w-4 mr-2" />
                            下载
                        </button>
                        
                        {downloadOpen && (
                            <div className="absolute right-0 mt-2 w-56 rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in zoom-in-95 duration-200 z-50">
                                <div className="p-1">
                                    <button onClick={handleDownloadReport} className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground">
                                        <FileText className="mr-2 h-4 w-4" />
                                        <span>下载报告 (Markdown)</span>
                                    </button>
                                    <button onClick={handleDownloadChat} className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground">
                                        <MessageSquare className="mr-2 h-4 w-4" />
                                        <span>下载聊天记录 (JSON)</span>
                                    </button>
                                    <button onClick={handleDownloadSlots} className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground">
                                        <Database className="mr-2 h-4 w-4" />
                                        <span>下载信息槽 (JSON)</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>

        {/* Report Content */}
        <div className="flex-1 overflow-hidden bg-muted/10">
            <div className="h-full overflow-y-auto p-6 lg:p-10">
                <div className="relative max-w-4xl mx-auto bg-card text-card-foreground rounded-xl shadow-sm border p-8 min-h-[80vh] animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                            <p className="text-muted-foreground animate-pulse">正在加载报告...</p>
                        </div>
                    ) : editing ? (
                        <textarea 
                            className="w-full h-[70vh] p-4 rounded-md border border-input bg-transparent text-sm font-mono leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none custom-scrollbar" 
                            value={editText} 
                            onChange={e => setEditText(e.target.value)} 
                            placeholder="输入 Markdown 内容..."
                        />
                    ) : project?.project_status === 'Completed' ? (
                        <div 
                            className="prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-a:text-primary hover:prose-a:underline prose-img:rounded-lg prose-pre:bg-muted prose-pre:text-foreground prose-pre:border prose-pre:border-border" 
                            dangerouslySetInnerHTML={{ __html: html }} 
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground">
                            <div className="bg-muted/50 p-8 rounded-full mb-6 ring-1 ring-border shadow-sm">
                                <FileText className="h-12 w-12 opacity-50" />
                            </div>
                            <h3 className="text-xl font-semibold text-foreground mb-2">暂无需求报告</h3>
                            <p className="text-sm text-muted-foreground max-w-xs text-center leading-relaxed">
                                该项目尚未生成需求报告。请先完成访谈，然后点击上方的“重新生成”按钮。
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
        
        {downloadOpen && <div className="fixed inset-0 z-40" onClick={() => setDownloadOpen(false)} />}
      </div>

      {/* Global Loading Mask */}
      {regenLoading && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center transition-all duration-300">
          <div className="flex flex-col items-center space-y-6 p-8 bg-card border border-border shadow-2xl rounded-xl animate-in zoom-in-95">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold text-foreground">正在重新生成报告</h3>
              <p className="text-sm text-muted-foreground">这可能需要几分钟时间，请勿关闭页面...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
