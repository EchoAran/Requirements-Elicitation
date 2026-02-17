import { useState, useEffect, useRef } from 'react'
import { Menu, Plus, Layout, MessageSquare, Edit2, Trash2, Clock, MoreVertical, X } from 'lucide-react'

export interface SidebarProject {
  project_id: number
  project_name: string
  initial_requirements: string
  created_at: string
  project_status?: string
}

interface SidebarProps {
  projects: SidebarProject[]
  selectedProject: SidebarProject | null
  onProjectSelect: (project: SidebarProject) => void
  onNewProject: () => void
  onRename?: (id: number, name: string) => void
  onDelete?: (id: number) => void
}

interface ProjectCardProps {
  project: SidebarProject
  isSelected: boolean
  onClick: () => void
  onRename?: (id: number, name: string) => void
  onDelete?: (id: number) => void
}

function ProjectCard({ project, isSelected, onClick, onRename, onDelete }: ProjectCardProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(project.project_name)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <div
      className={`group relative rounded-xl border p-4 cursor-pointer transition-all duration-200 ${
        isSelected 
          ? 'bg-accent border-primary/50 shadow-sm ring-1 ring-primary/20' 
          : 'bg-card border-border hover:border-primary/50 hover:shadow-md'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        {editing && onRename ? (
          <div className="flex items-center flex-1 space-x-2">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { 
                if (e.key === 'Enter') { 
                  e.stopPropagation(); 
                  onRename(project.project_id, name); 
                  setEditing(false) 
                } 
              }}
              className="flex-1 bg-background border border-input rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            <button 
              onClick={(e) => { e.stopPropagation(); setEditing(false); setName(project.project_name) }} 
              className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            <div className={`p-1.5 rounded-md ${isSelected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
              <Layout className="h-4 w-4" />
            </div>
            <h3 className="font-semibold text-foreground text-sm truncate flex-1">{project.project_name}</h3>
          </div>
        )}
        
        {!editing && onRename && onDelete && (
          <div className="relative" ref={menuRef}>
            <button 
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }} 
              className={`p-1 rounded-md transition-colors ${
                menuOpen || isSelected ? 'text-foreground opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-100'
              } hover:bg-muted`}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-32 bg-popover border border-border rounded-lg shadow-lg z-20 py-1" onClick={e => e.stopPropagation()}>
                <button 
                  className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent flex items-center space-x-2 transition-colors" 
                  onClick={() => { setEditing(true); setMenuOpen(false) }}
                >
                  <Edit2 className="h-3.5 w-3.5" /><span>重命名</span>
                </button>
                <button 
                  className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-destructive/10 flex items-center space-x-2 transition-colors" 
                  onClick={() => { setMenuOpen(false); onDelete(project.project_id) }}
                >
                  <Trash2 className="h-3.5 w-3.5" /><span>删除项目</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      
      <p className="text-muted-foreground text-xs mb-4 line-clamp-2 leading-relaxed">
        {project.initial_requirements || '无描述'}
      </p>
      
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center">
          <Clock className="h-3 w-3 mr-1.5" />
          {new Date(project.created_at).toLocaleDateString('zh-CN')}
        </div>
        {project.project_status && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
            project.project_status === 'Completed' 
              ? 'bg-green-50 text-green-700 border-green-200' 
              : 'bg-blue-50 text-blue-700 border-blue-200'
          }`}>
            {project.project_status === 'Completed' ? '已完成' : '进行中'}
          </span>
        )}
      </div>
    </div>
  )
}

export default function Sidebar({ projects, selectedProject, onProjectSelect, onNewProject, onRename, onDelete }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  
  return (
    <div className={`${collapsed ? 'w-16' : 'w-80'} bg-card border-r border-border h-screen flex flex-col transition-all duration-300 ease-in-out shadow-[1px_0_5px_rgba(0,0,0,0.03)] z-10`}>
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-6">
          {!collapsed && (
            <div className="flex items-center space-x-2 text-primary font-bold text-lg">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <MessageSquare className="h-5 w-5" />
              </div>
              <span>Requirements Interview</span>
            </div>
          )}
          <button 
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors ml-auto" 
            onClick={() => setCollapsed(!collapsed)}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        {!collapsed ? (
          <button 
            onClick={onNewProject} 
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all shadow-sm hover:shadow flex items-center justify-center space-x-2 font-medium"
          >
            <Plus className="h-5 w-5" />
            <span>新建项目</span>
          </button>
        ) : (
          <button 
            onClick={onNewProject} 
            className="w-full p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all shadow-sm flex items-center justify-center"
            title="新建项目"
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {!collapsed && projects.length > 0 && (
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
            最近项目
          </div>
        )}
        
        {collapsed ? (
          <div className="flex flex-col space-y-4 items-center pt-4">
            {projects.map(project => (
              <button
                key={project.project_id}
                className={`p-2 rounded-lg transition-colors relative group ${
                  selectedProject?.project_id === project.project_id 
                    ? 'bg-accent text-primary' 
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
                onClick={() => onProjectSelect(project)}
                title={project.project_name}
              >
                <Layout className="h-5 w-5" />
                {selectedProject?.project_id === project.project_id && (
                  <div className="absolute left-0 top-2 bottom-2 w-1 bg-primary rounded-r-full" />
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.project_id}
                project={project}
                isSelected={selectedProject?.project_id === project.project_id}
                onClick={() => onProjectSelect(project)}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
      
      <div className="p-4 border-t border-border">
         {!collapsed && (
           <div className="text-xs text-center text-muted-foreground">
             v2.0.0
           </div>
         )}
      </div>
    </div>
  )
}