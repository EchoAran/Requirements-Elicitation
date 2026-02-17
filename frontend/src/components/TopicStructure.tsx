import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Save, ChevronRight, Circle } from 'lucide-react'
import { getStructure, createSection, updateSection, deleteSection, createTopic, updateTopic, deleteTopic, createSlot, updateSlot, deleteSlot } from '@/api/client'

type SlotItem = { slot_id: number; slot_number: string; slot_key: string; slot_value: string | null; is_necessary: boolean }
type TopicItem = { topic_id: number; topic_number: string; topic_content: string; topic_status: string; slots: SlotItem[] }
type SectionItem = { section_id: number; section_number: string; section_content: string; topics: TopicItem[] }

interface Props { projectId: number; projectStatus: string }

export default function TopicStructure({ projectId, projectStatus }: Props) {
  const [sections, setSections] = useState<SectionItem[]>([])
  const [original, setOriginal] = useState<SectionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const readonly = projectStatus !== 'Pending'

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getStructure(projectId)
    setSections(data.sections)
    setOriginal(JSON.parse(JSON.stringify(data.sections)))
    setLoading(false)
  }, [projectId])

  useEffect(() => { load() }, [load])

  const toggle = (id: number) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const addSection = async () => {
    if (readonly) return
    const num = `section-${String(Date.now()).slice(-3)}`
    await createSection(projectId, num, '新章节')
    await load()
  }

  const addTopic = async (section: SectionItem) => {
    if (readonly) return
    const num = `${section.section_number}-${String(Date.now()).slice(-3)}`
    await createTopic(section.section_id, num, '新话题', 'Pending')
    await load()
  }

  const addSlot = async (topic: TopicItem) => {
    if (readonly) return
    const num = `${topic.topic_number}-${String(Date.now()).slice(-3)}`
    await createSlot(topic.topic_id, num, '键名', null, false)
    await load()
  }

  const removeSection = async (section: SectionItem) => {
    if (readonly) return
    await deleteSection(section.section_id)
    await load()
  }

  const removeTopic = async (topic: TopicItem) => {
    if (readonly) return
    await deleteTopic(topic.topic_id)
    await load()
  }

  const removeSlot = async (slot: SlotItem) => {
    if (readonly) return
    await deleteSlot(slot.slot_id)
    await load()
  }

  const cycleStatus = (topic: TopicItem) => {
    if (readonly) return
    const order = ['Pending','Ongoing','SystemInterrupted','UserInterrupted','Completed','Failed']
    const next = order[(order.indexOf(topic.topic_status)+1)%order.length]
    setSections(s => s.map(sec => sec.section_id === (sections.find(se=>se.topics.some(t=>t.topic_id===topic.topic_id))?.section_id ?? 0)
      ? { ...sec, topics: sec.topics.map(t => t.topic_id === topic.topic_id ? { ...t, topic_status: next } : t) }
      : sec))
  }

  const statusColor = (status: string) => {
    if (status === 'Pending') return 'bg-muted-foreground/40'
    if (status === 'Ongoing') return 'bg-blue-500'
    if (status === 'SystemInterrupted' || status === 'UserInterrupted') return 'bg-yellow-500'
    if (status === 'Completed') return 'bg-green-500'
    return 'bg-destructive'
  }

  const saveAll = async () => {
    if (readonly) return
    for (const sec of sections) {
      const origSec = original.find(o => o.section_id === sec.section_id)
      if (origSec && (origSec.section_number !== sec.section_number || origSec.section_content !== sec.section_content)) {
        await updateSection(sec.section_id, { section_number: sec.section_number, section_content: sec.section_content })
      }
      for (const t of sec.topics) {
        const origT = origSec?.topics.find(o => o.topic_id === t.topic_id)
        if (origT && (origT.topic_number !== t.topic_number || origT.topic_content !== t.topic_content || origT.topic_status !== t.topic_status)) {
          await updateTopic(t.topic_id, { topic_number: t.topic_number, topic_content: t.topic_content, topic_status: t.topic_status })
        }
        for (const r of t.slots) {
          const origR = origT?.slots.find(o => o.slot_id === r.slot_id)
          if (origR) {
            const patch: Record<string, unknown> = {}
            if (origR.slot_key !== r.slot_key) patch.slot_key = r.slot_key
            if (origR.slot_value !== r.slot_value) patch.slot_value = r.slot_value
            if (Object.keys(patch).length > 0) await updateSlot(r.slot_id, patch)
          }
        }
      }
    }
    setOriginal(JSON.parse(JSON.stringify(sections)))
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground animate-pulse">加载结构中...</div>

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className="flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur z-10 py-2 border-b mb-4">
        <h2 className="text-lg font-semibold tracking-tight flex items-center">
          访谈框架
        </h2>
        <div className="flex items-center space-x-2">
          <button 
            disabled={readonly} 
            className="inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3" 
            onClick={addSection}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> 添加章节
          </button>
          <button 
            disabled={readonly} 
            className="inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-8 px-3" 
            onClick={saveAll}
          >
            <Save className="h-3.5 w-3.5 mr-1" /> 保存更改
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {sections.map(section => (
          <div key={section.section_id} className="bg-card text-card-foreground rounded-xl border shadow-sm transition-all hover:shadow-md overflow-hidden">
            <div className="flex items-center justify-between p-4 bg-muted/30">
              <div className="flex items-center space-x-3 flex-1">
                <button onClick={() => toggle(section.section_id)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronRight className={`h-5 w-5 transition-transform duration-200 ${expanded[section.section_id] ? 'rotate-90' : ''}`} />
                </button>
                <div className="flex gap-2 flex-1 max-w-3xl">
                  <input 
                    disabled={readonly} 
                    value={section.section_number} 
                    onChange={e => setSections(s => s.map(it => it.section_id === section.section_id ? { ...it, section_number: e.target.value } : it))} 
                    className="h-8 w-32 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" 
                    placeholder="章节编号"
                  />
                  <input 
                    disabled={readonly} 
                    value={section.section_content} 
                    onChange={e => setSections(s => s.map(it => it.section_id === section.section_id ? { ...it, section_content: e.target.value } : it))} 
                    className="h-8 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" 
                    placeholder="章节内容"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-1 pl-2">
                <button disabled={readonly} onClick={() => addTopic(section)} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50" title="添加主题">
                  <Plus className="h-4 w-4" />
                </button>
                <button disabled={readonly} onClick={() => removeSection(section)} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50" title="删除章节">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            {expanded[section.section_id] && (
              <div className="p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                {section.topics.map(topic => (
                  <div key={topic.topic_id} className="rounded-lg border bg-background/50 p-3">
                    <div className="flex items-center space-x-3 mb-3">
                      <div onClick={() => cycleStatus(topic)} className={`h-3 w-3 rounded-full shrink-0 ${statusColor(topic.topic_status)} ${readonly ? '' : 'cursor-pointer hover:ring-2 ring-offset-1 ring-offset-background transition-all'}`} title={`状态: ${topic.topic_status}`} />
                      <div className="flex gap-2 flex-1">
                        <input 
                          disabled={readonly} 
                          value={topic.topic_number} 
                          onChange={e => setSections(s => s.map(sec => sec.section_id === section.section_id ? { ...sec, topics: sec.topics.map(t => t.topic_id === topic.topic_id ? { ...t, topic_number: e.target.value } : t) } : sec))} 
                          className="h-8 w-32 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" 
                          placeholder="主题编号"
                        />
                        <input 
                          disabled={readonly} 
                          value={topic.topic_content} 
                          onChange={e => setSections(s => s.map(sec => sec.section_id === section.section_id ? { ...sec, topics: sec.topics.map(t => t.topic_id === topic.topic_id ? { ...t, topic_content: e.target.value } : t) } : sec))} 
                          className="h-8 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" 
                          placeholder="主题内容"
                        />
                      </div>
                      <div className="flex items-center space-x-1">
                        <button disabled={readonly} onClick={() => addSlot(topic)} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50" title="添加槽位">
                          <Plus className="h-4 w-4" />
                        </button>
                        <button disabled={readonly} onClick={() => removeTopic(topic)} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50" title="删除主题">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    
                    {topic.slots.length > 0 && (
                      <div className="space-y-2 pl-6 border-l-2 border-muted ml-1.5">
                        {topic.slots.map(slot => (
                          <div key={slot.slot_id} className="flex items-start space-x-2 group">
                            <div className="pt-2 text-muted-foreground">
                              <Circle className="h-1.5 w-1.5 fill-current" />
                            </div>
                            <div className="flex gap-2 flex-1">
                              <input 
                                disabled={readonly} 
                                value={slot.slot_key} 
                                onChange={e => setSections(s => s.map(sec => sec.section_id === section.section_id ? { ...sec, topics: sec.topics.map(t => t.topic_id === topic.topic_id ? { ...t, slots: t.slots.map(r => r.slot_id === slot.slot_id ? { ...r, slot_key: e.target.value } : r) } : t) } : sec))} 
                                className="h-8 w-40 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" 
                                placeholder="Key"
                              />
                              <textarea 
                                readOnly={readonly} 
                                value={slot.slot_value ?? ''} 
                                onChange={e => setSections(s => s.map(sec => sec.section_id === section.section_id ? { ...sec, topics: sec.topics.map(t => t.topic_id === topic.topic_id ? { ...t, slots: t.slots.map(r => r.slot_id === slot.slot_id ? { ...r, slot_value: e.target.value } : r) } : t) } : sec))} 
                                className="min-h-[2rem] flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y" 
                                placeholder="Value"
                                rows={1}
                              />
                            </div>
                            <button 
                              disabled={readonly} 
                              onClick={() => removeSlot(slot)} 
                              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-0" 
                              title="删除槽位"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
