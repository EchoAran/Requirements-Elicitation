from sqlalchemy.orm import Session
from database.models import Topic, Section, Slot
from ..config import CONFIG
from ..prompts.question_strategy import QUESTION_STRATEGY_INSTRUCTIONS

class StrategySelector:
    @staticmethod
    def compute_completion(db: Session, project_id: int, current_topic_number: int) -> float:
        slots = db.query(Slot).join(Topic).join(Section).filter(
            Topic.topic_number == current_topic_number,
            Section.project_id == project_id
        ).all()
        if not slots:
            return 0.0
        filled = [s for s in slots if (s.slot_value is not None and str(s.slot_value).strip() != "")]
        return len(filled) / len(slots)

    @staticmethod
    def select(db: Session, project_id: int, current_topic: dict, current_topic_conversation_record: list) -> tuple[str, str, float]:
        c = StrategySelector.compute_completion(db, project_id, current_topic["topic_number"])
        code = "S2"
        if c == 0.0:
            code = "S1"
        elif 0.0 < c < CONFIG.STRATEGY_COMPLETION:
            code = "S2"
        elif CONFIG.STRATEGY_COMPLETION <= c < 1.0:
            code = "S3"
        elif c == 1.0:
            code = "S4"
        inst = QUESTION_STRATEGY_INSTRUCTIONS.get(code, QUESTION_STRATEGY_INSTRUCTIONS["S2"])
        print(f"Select strategy: {code} ({inst}) with completion {c}")
        return code, inst, c
