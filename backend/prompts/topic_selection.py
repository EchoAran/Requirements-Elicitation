topic_selection_prompt = """
# 职责：您是半结构化访谈中的主题选择专家。
# 任务：根据受访者在当前对话记录（特别是最后一轮对话中所表达的意图）中所体现的意愿，从访谈主题列表中选择下一轮访谈的主题。

# 输入：1. 当前访谈主题的描述 As [current_topic]:  
{current_topic_content}
2. 围绕本次访谈主题展开的对话记录 As [current_topic_conversation_record]:  
{current_topic_conversation_record}
3. 此次访谈所涵盖的所有主题的完整列表 As [topics_list]:  
{topics_list}

# 步骤：按照以下步骤完成任务：
## 步骤 1：根据[current_topic_conversation_record]中面试官与被面试者之间的对话内容，特别是最后一轮的对话，确定被面试者的当前意图。
## 步骤 2：根据用户的意图，从[topics_list]中选择最合适的非当前话题作为下一轮的面试话题。

# 输出：输出格式如下所示，请勿输出除以下所列格式之外的任何内容：
{
  "topic_number": "topic-X-X",
  "topic_content": "XXX"
}
"""