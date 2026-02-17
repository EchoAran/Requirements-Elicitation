topic_generation_prompt= """
# 职责：您是半结构化访谈中的主题选择专家。
# 任务：根据受访者在当前对话记录中所表达的意图（特别是上一轮对话的内容），生成一个与该部分相关但不同于任何现有主题的访谈主题。

# 输入：
1. 当前访谈主题的描述 As [current_topic]:  
{current_topic_content}
2. 围绕本次访谈主题展开的对话记录 As [current_topic_conversation_record]:  
{current_topic_conversation_record}
3. 此次访谈所涵盖的所有主题的完整列表 As [topics_list]:  
{topics_list}
4. 当前该主题所属的章节名称 As [section_content]:
{section_content}

# 步骤：按照以下步骤完成任务：
## 步骤 1：根据[current_topic_conversation_record]中面试官与被面试者之间的对话，特别是最后一轮的对话内容，确定被面试者的当前意图。
## 步骤 2：根据用户的意图，生成一个与[section_content]相关但不同于[topics_list]中任何现有话题的访谈主题。
  - 主题编号的命名规则是按照章节编号加上单独编号（槽位编号规则与此类似）。
  - 需要从[topics_list]中确定当前章节的最后一个主题编号，然后将其单独编号加一来创建一个新的主题编号。
## 步骤 3：针对此主题，设计几个相关槽位，用于在访谈过程中收集关于该主题的一些必要信息。
  - slot_numbers是倒序排列的，这意味着章节中最重要的槽位排在最前面。
  - slot_key：槽位以键值对的形式收集访谈中的必要信息，因此您只需生成具体且精细的属性名称。

# 注意：
1. topic指的是该章节中重点探讨的一个特定方面，其目的是为了深化该章节内容，而非指某个具体的访谈问题。
2. 请确保同一层级元素之间的逻辑递进关系（如主题与主题之间、槽与槽之间），以及不同层级之间过渡关系的深化与细化（从主题到槽）。
3. Topic和slot都应当尽可能详尽、准确地进行描述，而不能仅仅用寥寥数语以简单抽象的方式进行概括。
4. 除了固定格式外，slot_key、topic_content使用中文。

# 输出：输出格式如下所示，请勿输出除以下所列格式之外的任何内容：
{
  "topic_number": "topic-1-1",
  "topic_content": "XXX",
  "slots" : [
    {
      "slot_number": "slot-1-1-1",
      "slot_key": "XXX"
    },
    {
      "slot_number": "slot-1-1-2",
      "slot_key": "XXX"
    },
    ...
  ]
}
"""
