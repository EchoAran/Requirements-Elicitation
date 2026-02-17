export async function apiGet(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

export async function apiPost(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

export async function apiPatch(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

export async function apiDelete(url: string) {
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

export async function getProjects() {
  return apiGet('/api/projects')
}

export async function createProject(project_name: string, initial_requirements: string, domain_ids?: number[] | null, user_id?: number | null) {
  const body: Record<string, unknown> = { project_name, initial_requirements }
  if (Array.isArray(domain_ids)) body.domain_ids = domain_ids
  if (typeof user_id === 'number') body.user_id = user_id
  return apiPost('/api/projects', body)
}

export async function updateProject(project_id: number, data: Record<string, unknown>) {
  return apiPatch(`/api/projects/${project_id}`, data)
}

export async function deleteProject(project_id: number) {
  return apiDelete(`/api/projects/${project_id}`)
}

export async function getStructure(project_id: number) {
  return apiGet(`/api/projects/${project_id}/structure`)
}

export type LLMConfig = { api_url: string; api_key: string; model_name: string }
export function getLLMConfigFromStorage(): LLMConfig | null {
  const api_url = localStorage.getItem('llm_api_url') || ''
  const api_key = localStorage.getItem('llm_api_key') || ''
  const model_name = localStorage.getItem('llm_model_name') || ''
  if (!api_url || !api_key || !model_name) return null
  return { api_url, api_key, model_name }
}
export type EmbedConfig = { api_url: string; api_key: string; model_name: string }
export function getEmbedConfigFromStorage(): EmbedConfig | null {
  const api_url = localStorage.getItem('embedding_api_url') || ''
  const api_key = localStorage.getItem('embedding_api_key') || ''
  const model_name = localStorage.getItem('embedding_model_name') || ''
  if (!api_url || !api_key || !model_name) return null
  return { api_url, api_key, model_name }
}
export async function initializeFramework(project_id: number, config: LLMConfig) {
  return apiPost(`/api/projects/${project_id}/initialize`, config)
}

export async function listDomainExperiences(user_id?: number) {
  const url = user_id ? `/api/domain-experiences?user_id=${user_id}` : `/api/domain-experiences`
  return apiGet(url)
}

export async function createDomainExperience(data: Record<string, unknown>) {
  return apiPost(`/api/domain-experiences`, data)
}

export async function updateDomainExperience(domain_id: number, data: Record<string, unknown>) {
  return apiPatch(`/api/domain-experiences/${domain_id}`, data)
}

export async function deleteDomainExperience(domain_id: number) {
  return apiDelete(`/api/domain-experiences/${domain_id}`)
}

export async function recomputeDomainEmbedding(domain_id: number, api_key: string, api_url: string, model_name: string, text_override?: string) {
  return apiPost(`/api/domain-experiences/${domain_id}/embedding/recompute`, { api_key, api_url, model_name, text_override })
}

export async function recomputeAllDomainEmbeddings(api_key: string, api_url: string, model_name: string, user_id?: number) {
  return apiPost(`/api/domain-experiences/embedding/recompute-all`, { api_key, api_url, model_name, user_id })
}

export async function ingestCreateDomainExperience(fd: FormData) {
  const res = await fetch(`/api/domain-experiences/ingest-create`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

export async function getProjectChat(project_id: number) {
  return apiGet(`/api/projects/${project_id}/chat`)
}

export async function startInterview(project_id: number, config: LLMConfig) {
  return apiPost(`/api/projects/${project_id}/interview/start`, config)
}

export async function sendReply(project_id: number, config: LLMConfig, text: string) {
  return apiPost(`/api/projects/${project_id}/interview/reply`, { ...config, text })
}

export async function getProjectDetail(project_id: number) {
  return apiGet(`/api/projects/${project_id}`)
}

export async function regenerateReport(project_id: number, llm?: LLMConfig | null, embed?: EmbedConfig | null) {
  const body: Record<string, unknown> = {}
  if (llm) {
    body.llm_api_url = llm.api_url
    body.llm_api_key = llm.api_key
    body.llm_model_name = llm.model_name
  }
  if (embed) {
    body.embed_api_url = embed.api_url
    body.embed_api_key = embed.api_key
    body.embed_model_name = embed.model_name
  }
  return apiPost(`/api/projects/${project_id}/report/regenerate`, body)
}

export async function downloadReport(project_id: number) {
  const res = await fetch(`/api/projects/${project_id}/report/download`)
  if (!res.ok) throw new Error(String(res.status))
  const blob = await res.blob()
  return blob
}

export async function downloadChat(project_id: number) {
  const res = await fetch(`/api/projects/${project_id}/chat/download`)
  if (!res.ok) throw new Error(String(res.status))
  const blob = await res.blob()
  return blob
}

export async function downloadSlots(project_id: number) {
  const res = await fetch(`/api/projects/${project_id}/slots/download`)
  if (!res.ok) throw new Error(String(res.status))
  const blob = await res.blob()
  return blob
}

export async function evaluateEntropy(config: LLMConfig, text: string) {
  return apiPost(`/api/projects/entropy-evaluate`, { ...config, text })
}

export async function getConfigValues() {
  return apiGet(`/api/config`)
}

type MetaConversationItem = { role: string; content: string }
export async function metaInterviewNext(
  config: LLMConfig,
  summary: { core_goal?: string; core_users?: string[]; core_functions?: string[]; constraints?: string[]; acceptance?: string[] } | null,
  coverage: { goal?: string; users?: string; functions?: string; constraints?: string; acceptance?: string } | null,
  conversation: MetaConversationItem[],
  template_text?: string
) {
  return apiPost(`/api/meta-interview/next`, { ...config, summary: summary || {}, coverage: coverage || {}, conversation, template_text: template_text || '' })
}

export async function retrievalSuggest(project_id: number, embed: { api_url: string; api_key: string; model_name: string }, user_id?: number | null) {
  return apiPost(`/api/projects/${project_id}/retrieval/suggest`, { ...embed, user_id })
}

export async function retrievalFuse(project_id: number, items: { domain_id: number; weight: number }[], config?: LLMConfig) {
  const payload = config ? { items, api_url: config.api_url, api_key: config.api_key, model_name: config.model_name } : { items }
  return apiPost(`/api/projects/${project_id}/retrieval/fuse`, payload)
}

export async function initializeFrameworkWithFused(project_id: number, config: LLMConfig, fused_text: string) {
  return apiPost(`/api/projects/${project_id}/initialize-with-fused`, { ...config, fused_text })
}

// New endpoints to support pre-creation retrieval and atomic project creation
export async function retrievalSuggestFromText(text: string, embed: { api_url: string; api_key: string; model_name: string }, threshold?: number, top_k?: number, user_id?: number | null) {
  const body: Record<string, unknown> = { ...embed, text }
  if (typeof threshold === 'number') body.threshold = threshold
  if (typeof top_k === 'number') body.top_k = top_k
  if (typeof user_id === 'number' || user_id === null) body.user_id = user_id
  return apiPost(`/api/retrieval/suggest-text`, body)
}

export async function retrievalFuseGlobal(items: { domain_id: number; weight: number }[], config?: LLMConfig) {
  const payload = config ? { items, api_url: config.api_url, api_key: config.api_key, model_name: config.model_name } : { items }
  return apiPost(`/api/retrieval/fuse`, payload)
}

export async function createAndInitializeProject(project_name: string, initial_requirements: string, config: LLMConfig, fused_text?: string, user_id?: number | null, domain_ids?: number[] | null) {
  const body: Record<string, unknown> = { project_name, initial_requirements, api_url: config.api_url, api_key: config.api_key, model_name: config.model_name, fused_text: fused_text || "" }
  if (typeof user_id === 'number') body.user_id = user_id
  if (Array.isArray(domain_ids)) body.domain_ids = domain_ids
  return apiPost(`/api/projects/create-and-initialize`, body)
}

export async function getPriority(project_id: number, config: LLMConfig) {
  return apiPost(`/api/projects/${project_id}/topics/priority`, { ...config })
}

export async function createSection(project_id: number, section_number: string, section_content: string) {
  return apiPost(`/api/projects/${project_id}/sections`, { section_number, section_content })
}

export async function updateSection(section_id: number, data: Record<string, unknown>) {
  return apiPatch(`/api/sections/${section_id}`, data)
}

export async function deleteSection(section_id: number) {
  return apiDelete(`/api/sections/${section_id}`)
}

export async function createTopic(section_id: number, topic_number: string, topic_content: string, topic_status: string) {
  return apiPost(`/api/sections/${section_id}/topics`, { topic_number, topic_content, topic_status })
}

export async function updateTopic(topic_id: number, data: Record<string, unknown>) {
  return apiPatch(`/api/topics/${topic_id}`, data)
}

export async function deleteTopic(topic_id: number) {
  return apiDelete(`/api/topics/${topic_id}`)
}

export async function createSlot(topic_id: number, slot_number: string, slot_key: string, slot_value: string | null, is_necessary: boolean) {
  return apiPost(`/api/topics/${topic_id}/slots`, { slot_number, slot_key, slot_value, is_necessary })
}

export async function updateSlot(slot_id: number, data: Record<string, unknown>) {
  return apiPatch(`/api/slots/${slot_id}`, data)
}

export async function deleteSlot(slot_id: number) {
  return apiDelete(`/api/slots/${slot_id}`)
}


// Framework Templates
export async function listFrameworkTemplates(user_id?: number) {
  const url = user_id ? `/api/templates?user_id=${user_id}` : `/api/templates`
  return apiGet(url)
}

export async function createFrameworkTemplate(data: Record<string, unknown>) {
  return apiPost(`/api/templates`, data)
}

export async function updateFrameworkTemplate(template_id: number, data: Record<string, unknown>) {
  return apiPatch(`/api/templates/${template_id}`, data)
}

export async function deleteFrameworkTemplate(template_id: number) {
  return apiDelete(`/api/templates/${template_id}`)
}

export async function saveFrameworkTemplateFromProject(project_id: number, template_name: string, template_description?: string) {
  return apiPost(`/api/templates/save-from-project/${project_id}`, { template_name, template_description })
}

export async function initializeProjectWithTemplate(project_id: number, template_id: number) {
  return apiPost(`/api/projects/${project_id}/initialize-with-template`, { template_id })
}

export async function prefillFromInitial(project_id: number, config: LLMConfig) {
  return apiPost(`/api/projects/${project_id}/prefill-from-initial`, config)
}
