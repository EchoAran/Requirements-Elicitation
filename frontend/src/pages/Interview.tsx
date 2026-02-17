import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Sidebar, { SidebarProject } from '@/components/Sidebar'
import { getProjects } from '@/api/client'
import { getProjectChat, startInterview, getLLMConfigFromStorage, getEmbedConfigFromStorage, sendReply, regenerateReport, getStructure, getPriority } from '@/api/client'
import { Send, ChevronLeft, Bot, User, Sparkles } from 'lucide-react'

interface MessageItem { message_id: number; role: string; message_type: string; message_content: string; created_time: string; topic_number?: string; topic_content?: string }
interface TopicBrief { topic_id: number; topic_number: string; topic_content: string; topic_status: string }
interface Project { project_id: number; project_name: string; initial_requirements: string; project_status: string }

export default function Interview() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const pid = Number(projectId)
  const [project, setProject] = useState<Project | null>(null)
  const [topic, setTopic] = useState<TopicBrief | null>(null)
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [projects, setProjects] = useState<SidebarProject[]>([])
  const [replyText, setReplyText] = useState('')
  const startedRef = useRef(false)
  const [generating, setGenerating] = useState(false)
  const [ended, setEnded] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [completion, setCompletion] = useState<number>(0)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [priorityLoading, setPriorityLoading] = useState(false)
  const [priority, setPriority] = useState<{ topic_number: string; topic_content: string; status: string; core: number }[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, generating])

  const load = useCallback(async () => {
    setLoading(true)
    const plist = await getProjects()
    setProjects(plist.projects)
    const p = plist.projects.find((x: Project) => x.project_id === pid) || null
    setProject(p)
    if (!p) { setLoading(false); return }
    if (p.project_status === 'Pending' && !startedRef.current) {
      const cfg = getLLMConfigFromStorage()
      if (!cfg) { setLoading(false); return }
      startedRef.current = true
      setStarting(true)
      try {
        await startInterview(pid, cfg)
      } catch (e) {
        startedRef.current = false
        throw e
      } finally {
        setStarting(false)
      }
    }
    const chat = await getProjectChat(pid)
    setTopic(chat.current_topic)
    setMessages(chat.messages)
    try {
      const st = await getStructure(pid)
      const tnum = chat.current_topic?.topic_number
      if (tnum) {
        let must = 0, filled = 0
        for (const sec of st.sections || []) {
          for (const tp of sec.topics || []) {
            if (tp.topic_number === tnum) {
              for (const sl of tp.slots || []) {
                if (sl.is_necessary) {
                  must += 1
                  if (sl.slot_value !== null && String(sl.slot_value).trim() !== '') filled += 1
                }
              }
            }
          }
        }
        setCompletion(must > 0 ? filled / must : 0)
      } else {
        setCompletion(0)
      }
    } catch {
      setCompletion(0)
    }
    setLoading(false)
  }, [pid])

  const togglePriority = async () => {
    if (priorityOpen) { setPriorityOpen(false); return }
    const cfg = getLLMConfigFromStorage()
    if (!cfg) { return }
    setPriorityOpen(true)
    setPriorityLoading(true)
    try {
      const res = await getPriority(pid, cfg)
      const arr = res.priority || []
      setPriority(arr)
    } finally {
      setPriorityLoading(false)
    }
  }

  useEffect(() => { if (!Number.isNaN(pid)) { load() } }, [load, pid])
  useEffect(() => { if (project?.project_status === 'Completed') setEnded(true) }, [project])
  useEffect(() => {
    const k = `priority_auto_open_${pid}`
    const v = localStorage.getItem(k)
    if (v === '1') {
      try { localStorage.removeItem(k) } catch { void 0 }
      ;(async () => { await togglePriority() })()
    }
  }, [pid, togglePriority])

  const busy = loading || starting || generating || reporting
  const isCompleted = project?.project_status === 'Completed'

  const handleSend = async () => {
    if (busy) return
    const text = replyText.trim()
    if (!text) return
    const cfg = getLLMConfigFromStorage()
    if (!cfg) return
    setGenerating(true)
    const optimistic: MessageItem = {
      message_id: -Date.now(),
      role: 'Interviewee',
      message_type: 'Text',
      message_content: text,
      created_time: new Date().toISOString(),
    }
    setMessages(ms => [...ms, optimistic])
    setReplyText('')
    const resp = await sendReply(pid, cfg, text)
    if (resp && resp.end) {
      setTopic(null)
      const endMsg: MessageItem = {
        message_id: -Date.now() - 1,
        role: 'Interviewer',
        message_type: 'Text',
        message_content: resp.end_message || 'Interview concluded.',
        created_time: new Date().toISOString(),
      }
      setMessages(ms => [...ms, endMsg])
      setEnded(true)
      setGenerating(false)
      const cfg = getLLMConfigFromStorage()
      const embedCfg = getEmbedConfigFromStorage()
      setReporting(true)
      try { await regenerateReport(pid, cfg || null, embedCfg || null) } finally { setReporting(false) }
      navigate(`/projects/${pid}/report`)
    } else {
      const chat = await getProjectChat(pid)
      setTopic(chat.current_topic)
      setMessages(chat.messages)
      try {
        const st = await getStructure(pid)
        const tnum = chat.current_topic?.topic_number
        if (tnum) {
          let must = 0, filled = 0
          for (const sec of st.sections || []) {
            for (const tp of sec.topics || []) {
              if (tp.topic_number === tnum) {
                for (const sl of tp.slots || []) {
                  if (sl.is_necessary) {
                    must += 1
                    if (sl.slot_value !== null && String(sl.slot_value).trim() !== '') filled += 1
                  }
                }
              }
            }
          }
          setCompletion(must > 0 ? filled / must : 0)
        } else {
          setCompletion(0)
        }
      } catch {
        setCompletion(0)
      }
      setGenerating(false)
    }
  }


  return (
    <div className="flex h-screen bg-background">
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

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-screen bg-background">
        {/* Top Header */}
        <header className="h-16 border-b border-border bg-card flex items-center px-6 justify-between shrink-0 z-10 shadow-sm">
          <div className="flex items-center space-x-4">
            <button 
              disabled={busy} 
              onClick={() => { if (busy) return; localStorage.setItem('selectedProjectId', String(pid)); navigate('/') }} 
              className="p-2 hover:bg-accent rounded-full text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-foreground flex items-center">
                {project?.project_name}
                <span className={`ml-3 px-2 py-0.5 text-xs rounded-full border ${
                  project?.project_status === 'Completed' 
                    ? 'bg-green-50 text-green-700 border-green-200' 
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}>
                  {project?.project_status}
                </span>
              </h1>
            </div>
          </div>
          
          <button 
            disabled={busy} 
            onClick={togglePriority} 
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              priorityOpen 
                ? 'bg-primary/10 text-primary border-primary/20' 
                : 'bg-background border-border text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>
               {topic ? `Topic: ${topic.topic_number}` : 'Priorities'} 
               {typeof completion === 'number' && topic ? ` (${Math.round((completion || 0) * 100)}%)` : ''}
            </span>
          </button>
        </header>

        <div className="flex-1 flex overflow-hidden relative">
           {/* Chat Messages */}
           <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-muted/10">
             {messages.map(m => (
               <div key={m.message_id} className={`flex ${m.role === 'Interviewer' ? 'justify-start' : 'justify-end'}`}>
                 <div className={`flex max-w-[80%] ${m.role === 'Interviewer' ? 'flex-row' : 'flex-row-reverse'}`}>
                    <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center mt-1 shadow-sm ${
                      m.role === 'Interviewer' 
                        ? 'bg-white border border-border mr-3' 
                        : 'bg-primary ml-3'
                    }`}>
                       {m.role === 'Interviewer' ? <Bot className="h-5 w-5 text-primary" /> : <User className="h-5 w-5 text-primary-foreground" />}
                    </div>
                    <div className={`rounded-2xl px-5 py-3.5 shadow-sm text-sm leading-relaxed ${
                      m.role === 'Interviewer' 
                        ? 'bg-card text-foreground border border-border rounded-tl-none' 
                        : 'bg-primary text-primary-foreground rounded-tr-none'
                    }`}>
                       {m.message_content}
                    </div>
                 </div>
               </div>
             ))}
             
             {(loading || starting || generating) && (
               <div className="flex justify-start">
                 <div className="flex items-center space-x-3 max-w-[80%]">
                    <div className="shrink-0 h-8 w-8 rounded-full bg-white border border-border flex items-center justify-center shadow-sm">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div className="px-5 py-3 rounded-2xl rounded-tl-none bg-card border border-border shadow-sm flex items-center space-x-2">
                      <span className="text-sm text-muted-foreground">Typing</span>
                      <span className="flex space-x-1">
                        <span className="animate-bounce delay-0 h-1.5 w-1.5 bg-muted-foreground rounded-full"></span>
                        <span className="animate-bounce delay-150 h-1.5 w-1.5 bg-muted-foreground rounded-full"></span>
                        <span className="animate-bounce delay-300 h-1.5 w-1.5 bg-muted-foreground rounded-full"></span>
                      </span>
                    </div>
                 </div>
               </div>
             )}
             <div ref={messagesEndRef} />
           </div>

           {/* Priority Sidebar (Floating/Overlay) */}
           {priorityOpen && (
             <div className="w-80 bg-card border-l border-border shadow-xl flex flex-col animate-in slide-in-from-right duration-200 z-20 absolute right-0 top-0 bottom-0">
               <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
                 <h3 className="font-semibold text-foreground">Topic Priority</h3>
                 <button onClick={() => setPriorityOpen(false)} className="text-muted-foreground hover:text-foreground">
                   <ChevronLeft className="h-5 w-5 rotate-180" />
                 </button>
               </div>
               <div className="flex-1 overflow-y-auto p-4">
                 {priorityLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                 ) : (
                   <div className="space-y-3">
                     {priority.map((p, idx) => (
                       <div key={`${p.topic_number}-${idx}`} className="p-3 rounded-lg border border-border bg-background hover:bg-accent/50 transition-colors">
                         <div className="flex items-center justify-between mb-1">
                           <span className="font-mono text-xs font-medium text-primary px-1.5 py-0.5 bg-primary/10 rounded">
                             {p.topic_number}
                           </span>
                           <span className="text-xs text-muted-foreground font-medium">Score: {p.core?.toFixed(1)}</span>
                         </div>
                         <p className="text-sm text-foreground">{p.topic_content}</p>
                       </div>
                     ))}
                   </div>
                 )}
               </div>
             </div>
           )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-background border-t border-border">
          <div className="max-w-4xl mx-auto relative">
            <textarea 
              disabled={busy || ended || isCompleted} 
              className="w-full bg-card border border-input rounded-3xl pl-6 pr-14 py-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed text-foreground placeholder:text-muted-foreground min-h-[60px] max-h-[300px] resize-y" 
              placeholder="Type your reply... (Shift+Enter for new line)" 
              value={replyText} 
              onChange={e => setReplyText(e.target.value)} 
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
            <button 
              disabled={busy || ended || isCompleted || !replyText.trim()} 
              onClick={handleSend} 
              className="absolute right-3 bottom-3 p-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 disabled:opacity-0 disabled:scale-75 transition-all shadow-sm"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
          <div className="text-center mt-2">
             <p className="text-xs text-muted-foreground">AI-powered interview assistant</p>
          </div>
        </div>
      </div>

      {/* Reporting Overlay */}
      {reporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card rounded-xl shadow-lg border border-border p-8 text-center max-w-sm w-full mx-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-foreground mb-2">正在生成需求报告</h3>
            <p className="text-sm text-muted-foreground">正在分析访谈数据并整理需求，请稍候...</p>
          </div>
        </div>
      )}

      {/* Review functionality removed */}
    </div>
  )
}
