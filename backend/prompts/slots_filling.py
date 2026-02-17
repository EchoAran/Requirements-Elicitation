slots_filling_prompt = """
# 职责：您是专业的信息提取专家。
# 背景：半结构化访谈正在进行。当前我们基于“本次访谈的对话记录”（该记录来源于当前调度主题，不一定是目标主题，且可能同时涉及多个主题），对目标主题的槽位进行填充、更新或扩展。
# 任务：从本次访谈的对话记录中提取与目标主题相关的关键信息，并据此对目标主题下的槽位进行填充/更新/扩展；若没有可用信息，则不做任何修改。
# 准则：若无法明确填充某个槽位的值，请尽量避免填充模糊的内容；而应填充具体、有实际意义的信息。

# 输入：
1. 目标主题的描述 As [current_topic]:
  {current_topic_content}
2. 本次访谈的对话记录 As [current_topic_conversation_record]：
  {current_topic_conversation_record}
3. 目标主题的槽位清单（已填与未填） As [current_topic_info_slots]:
  {current_topic_info_slots}
4. 全项目其他主题的已收集信息概要 As [entire_project_info_slots]：
  {entire_interview_info_slots}
  
# 步骤：
## 步骤1：对[最新一轮对话记录]进行审阅，聚焦与[current_topic]直接相关的新增/更明确/更细化的信息。
## 步骤2：对[current_topic_info_slots]进行填充或更新；若需要承载新增信息而不存在合适槽位，则创建“新槽位”。
## 步骤3：若本轮对话未提供与[current_topic]相关的有效信息：
  - 输出空数组 []（不返回任何未变化的槽）。

# 内容填充规则：
  - 槽位值必须是直接从[最新一轮对话记录]中提取的、无任何逻辑演绎或推理，但要注意凝练信息而不是冗余填充。
  - 若[最新一轮对话记录]中包含与[current_topic]无关的信息，不填充到槽位。
  - 只填充与以提供信息强相关的槽位，不填充与信息无关的槽位。

# 注意：
1. 以最新一轮对话为主；允许参考上下文但不要臆造。
2. 填充/更新内容必须与[current_topic]一致；若跨主题信息更合适，请勿填入本主题槽位。
3. 创建新槽位时，确保粒度与现有槽一致、内容不与[当前主题槽位]或[全项目信息概要]中的槽重复；命名与格式保持一致。
4. 对无法确定的槽，slot_value 请标记为"None"（必须加引号）。
5. 除固定格式外，slot_key、slot_value（除"None"）使用中文。

# 输出格式如下所示（仅返回你认为需要“填充/更新/扩展”的槽；若无则返回 []）：
[
  {
    "slot_number": "slot-1-1-1",
    "slot_key": "XXX",
    "slot_value": "XXX"
  },
  {
    "slot_number": "slot-1-1-2",
    "slot_key": "XXX",
    "slot_value": "None"
  }
]
"""
