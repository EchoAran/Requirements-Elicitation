import os

def _get_float(name: str, default: float) -> float:
    try:
        v = os.getenv(name)
        if v is None:
            return float(default)
        return float(v)
    except Exception:
        return float(default)

def _get_int(name: str, default: int) -> int:
    try:
        v = os.getenv(name)
        if v is None:
            return int(default)
        return int(v)
    except Exception:
        return int(default)


class AppConfig:
    def __init__(self) -> None:
        # 文本长度归一化系数：用于计算 length_score = min(1, len(text)/LENGTH_COEFFICIENT)
        self.LENGTH_COEFFICIENT = _get_float("LENGTH_COEFFICIENT", 500)
        # 信息熵中的长度权重：entropy = ENTROPY_LENGTH_WEIGHT*length_score + ENTROPY_SEMANTIC_WEIGHT*(semantic/100)
        self.ENTROPY_LENGTH_WEIGHT = _get_float("ENTROPY_LENGTH_WEIGHT", 0.3)
        # 信息熵中的语义评分权重：与上项合计建议≈1.0（不强制）
        self.ENTROPY_SEMANTIC_WEIGHT = _get_float("ENTROPY_SEMANTIC_WEIGHT", 0.7)
        self.ENTROPY_THRESHOLD = _get_float("ENTROPY_THRESHOLD", 0.6)
        
        # 知识贡献（KC）主题权重：Score_KC = KC_TOPIC_WEIGHT*F_topic + KC_SLOT_WEIGHT*F_slot
        # 其中 F_topic = 动态主题数/初始主题数（必要主题）
        self.KC_TOPIC_WEIGHT = _get_float("KC_TOPIC_WEIGHT", 0.5)
        # 知识贡献（KC）槽位权重：F_slot = 扩展槽位数/初始槽位数（必要槽）
        self.KC_SLOT_WEIGHT = _get_float("KC_SLOT_WEIGHT", 0.5)
        # KC阈值：当 Score_KC >= KC_THRESHOLD 时触发后台领域经验自学习优化
        self.KC_THRESHOLD = _get_float("KC_THRESHOLD", 0.2)

        # 领域经验检索余弦相似度阈值：cosine >= 阈值 或存在标签匹配时保留候选
        self.RETRIEVAL_COSINE_THRESHOLD = _get_float("RETRIEVAL_COSINE_THRESHOLD", 0.7)
        self.RETRIEVAL_TOP_K = _get_int("RETRIEVAL_TOP_K", 5)

        # 操作选择置信度阈值：>= THETA 执行推荐操作，否则维持当前主题；也用于选择高/低置信度文案模板
        self.OPERATION_SELECTION_THETA = _get_float("OPERATION_SELECTION_THETA", 0.6)

        # 主题完成度低阈值：槽位填充比例  0 < STRATEGY_COMPLETION 时采用filling_phase策略；STRATEGY_COMPLETION < 100 使用digging_phase策略
        self.STRATEGY_COMPLETION = _get_float("STRATEGY_COMPLETION_LOW", 0.5)

        # 背景自学习所用LLM接口URL（由前端设置；为空表示不从环境加载）
        self.DOMAIN_LEARN_API_URL = ""
        # 背景自学习所用LLM模型名称（由前端设置）
        self.DOMAIN_LEARN_MODEL_NAME = ""
        # Embedding服务URL（由前端设置）
        self.EMBED_API_URL = ""
        # Embedding模型名称（由前端设置）
        self.EMBED_MODEL_NAME = ""
        # Embedding服务密钥（由前端设置）
        self.EMBED_API_KEY = ""

        # 调度文案模板：按置信度分桶（high/low），用于生成“采访者备注”的转场或说明文本
        self.SCHED_TEMPLATES = {
            "high": {
                "switch_another_topic": "对话已从 [{prev}] 切换到 [{next}]。",
                "create_new_topic": "根据受访者的意图，系统创建并进入了一个新主题 [{next}]。",
                "end_current_topic": "我们刚已完成并结束了主题 [{prev}]，现在切换到了新主题 [{next}]。",
                "refuse_current_topic": "受访者已拒绝继续讨论主题 [{prev}]，现在已经切换到了新主题 [{next}]。",
                "refuse_current_topic_and_switch_another_topic": "根据受访者的意图，我们判断受访者拒绝继续讨论主题 [{prev}] ，我们现在切换到了 [{next}]。",
                "refuse_current_topic_and_create_new_topic": "根据受访者的意图，我们判断受访者拒绝继续讨论主题 [{prev}] ，我们新建并切换到了新主题 [{next}]。",
                "maintain_current_topic": "",
            },
            "low": {
                "switch_another_topic": "系统怀疑受访者想从 [{prev}] 切换到其他主题，但置信度不足。请先用一个礼貌的核实问题确认是否要切换，以及希望切换到哪个主题。",
                "create_new_topic": "系统怀疑受访者想讨论一个新主题，但置信度不足。请先核实该意图，并简要确认新主题的范围。",
                "end_current_topic": "系统怀疑受访者想结束当前主题 [{prev}]，但置信度不足。请先用一个核实问题确认是否已完成并愿意结束。",
                "refuse_current_topic": "系统怀疑受访者拒绝继续讨论当前主题 [{prev}]，但置信度不足。请先礼貌确认，并给出可选路径。",
                "refuse_current_topic_and_switch_another_topic": "系统怀疑受访者想拒绝当前主题并切换到其他主题，但置信度不足。请先确认是否拒绝以及希望切换到哪个主题。",
                "refuse_current_topic_and_create_new_topic": "系统怀疑受访者想拒绝当前主题并讨论一个新主题，但置信度不足。请先确认该意图。",
                "maintain_current_topic": "",
            },
        }

    def format_scheduling_log(self, best_op: str, confidence: float, prev_topic_name: str, next_topic_name: str | None = None) -> str:
        bucket = "high" if confidence >= self.OPERATION_SELECTION_THETA else "low"
        tmpl = self.SCHED_TEMPLATES.get(bucket, {}).get(best_op, "")
        if not tmpl:
            return ""
        return (
            tmpl.replace("{prev}", str(prev_topic_name))
            .replace("{next}", str(next_topic_name or ""))
        )


CONFIG = AppConfig()
