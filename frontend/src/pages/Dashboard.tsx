import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar, { SidebarProject as Project } from '@/components/Sidebar'
import { Settings, Clock, LogOut, FileText, MessageSquare } from 'lucide-react'
import TopicStructure from '@/components/TopicStructure'
import ConfirmDialog from '@/components/ConfirmDialog'
import { getProjects, updateProject, deleteProject } from '@/api/client'

interface MainContentProps {
  project: Project | null
}

function MainContent({ project }: MainContentProps) {
  const navigate = useNavigate()
  
  if (!project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/30">
        <div className="text-center max-w-md px-4">
          <div className="bg-background p-8 rounded-full w-32 h-32 mx-auto mb-6 flex items-center justify-center shadow-sm border border-border">
            <Settings className="h-12 w-12 text-muted-foreground/50" />
          </div>
          <h3 className="text-xl font-semibold text-foreground mb-3">准备好了吗？</h3>
          <p className="text-muted-foreground mb-8">请从左侧选择一个项目以查看详情或开始访谈。</p>
          <div className="flex justify-center space-x-4">
            <button 
               onClick={() => navigate('/projects/new')}
               className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium shadow-sm"
            >
              新建项目
            </button>
          </div>
        </div>
      </div>
    )
  }

  const projectId = project.project_id

  return (
    <div className="flex-1 bg-muted/30 overflow-y-auto">
      <div className="max-w-6xl mx-auto p-8 space-y-8">
        {/* Header Section */}
        <div className="bg-card rounded-xl border border-border p-8 shadow-sm">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <h1 className="text-3xl font-bold text-foreground tracking-tight">{project.project_name}</h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                  project.project_status === 'Completed' 
                    ? 'bg-green-50 text-green-700 border-green-200' 
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}>
                  {project.project_status}
                </span>
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <Clock className="h-4 w-4 mr-1.5" />
                创建于 {new Date(project.created_at).toLocaleDateString('zh-CN')}
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <button 
                onClick={() => navigate('/settings')} 
                className="p-2.5 bg-background border border-border rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors text-muted-foreground"
                title="设置"
              >
                <Settings className="h-5 w-5" />
              </button>
              <button 
                onClick={() => { localStorage.removeItem('user'); navigate('/login') }}
                className="p-2.5 bg-background border border-border rounded-lg hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-all text-muted-foreground"
                title="退出登录"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
          
          <div className="bg-muted/50 rounded-lg p-4 border border-border/50">
            <h3 className="text-sm font-medium text-foreground mb-2 flex items-center">
              <FileText className="h-4 w-4 mr-2 text-primary" />
              初始需求
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {project.initial_requirements || '暂无描述'}
            </p>
          </div>
        </div>

        {/* Structure Visualization */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          {/* <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-foreground">访谈框架</h2>
          </div> */}
          <TopicStructure projectId={projectId} projectStatus={project.project_status} />
        </div>

         {/* Actions Bar */}
        <div className="flex justify-end">
          <div className="flex items-center space-x-4">
             {project.project_status === 'Completed' && (
              <button 
                onClick={() => navigate(`/projects/${projectId}/report`)}
                className="flex items-center space-x-2 px-8 py-3 bg-white border border-border text-foreground rounded-xl hover:bg-accent hover:text-accent-foreground transition-all shadow-sm"
              >
                <FileText className="h-5 w-5" />
                <span className="text-lg font-medium">查看报告</span>
              </button>
            )}
            <button 
              onClick={() => navigate(`/projects/${projectId}/interview`)}
              className="group flex items-center space-x-2 px-8 py-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
            >
              <MessageSquare className="h-5 w-5 group-hover:scale-110 transition-transform" />
              <span className="text-lg font-medium">
                {project.project_status === 'Completed' ? '回顾访谈' : '开始访谈'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const navigate = useNavigate()
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      const data = await getProjects()
      setProjects(data.projects)
      const preferredIdRaw = localStorage.getItem('selectedProjectId')
      if (preferredIdRaw) {
        const preferredId = Number(preferredIdRaw)
        const target = data.projects.find((p: Project) => p.project_id === preferredId)
        if (target) setSelectedProject(target)
        else if (data.projects.length > 0) setSelectedProject(data.projects[0])
        localStorage.removeItem('selectedProjectId')
      } else {
        if (data.projects.length > 0) setSelectedProject(data.projects[0])
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleNewProject = () => { navigate('/projects/new') }

  const handleRename = async (id: number, name: string) => {
    await updateProject(id, { project_name: name })
    await fetchProjects()
  }

  const handleDelete = async (id: number) => {
    await deleteProject(id)
    await fetchProjects()
    setSelectedProject(prev => prev && prev.project_id === id ? null : prev)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">正在加载项目...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar
        projects={projects}
        selectedProject={selectedProject}
        onProjectSelect={setSelectedProject}
        onNewProject={handleNewProject}
        onRename={handleRename}
        onDelete={(id) => { setConfirmId(id); setConfirmOpen(true) }}
      />
      <MainContent project={selectedProject} />
      <ConfirmDialog
        open={confirmOpen}
        title="确认删除项目？"
        description="此操作无法撤销。这将永久删除该项目及其所有相关数据。"
        confirmText="删除"
        cancelText="取消"
        onConfirm={async () => { if (confirmId !== null) await handleDelete(confirmId); setConfirmOpen(false); setConfirmId(null) }}
        onCancel={() => { setConfirmOpen(false); setConfirmId(null) }}
      />
    </div>
  )
}