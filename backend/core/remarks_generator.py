from sqlalchemy import and_
from sqlalchemy.orm import Session
from database.models import Slot, Topic, Section, Project
from ..llm_handler import LLMHandler
from ..prompts.remarks_generation import remarks_generation_prompt
from .strategy_selector import StrategySelector

class RemarksGenerator:
    @staticmethod
    async def generate_remarks(db: Session, llm_handler: LLMHandler, project_id: int, current_topic: dict,
                                   current_topic_conversation_record: list, topics_list: list, scheduling_log: str | None = None) -> str:
        try:
            # Obtain the slot for the current topic
            slots = db.query(
                Slot.slot_number,
                Slot.slot_key,
                Slot.slot_value,
                Slot.is_necessary,
            ).join(Topic).join(Section).filter(
                Topic.topic_number == current_topic["topic_number"],
                Section.project_id == project_id
            ).all()

            current_topic_info_slots = []
            for slot in slots:
                current_topic_info_slots.append({
                    "slot_number": slot.slot_number,
                    "slot_key": slot.slot_key,
                    "slot_value": slot.slot_value,
                    "is_necessary": slot.is_necessary,
                })

            # Obtain all the filled slots in the project and group them by topic
            filled_slots_object = db.query(
                Slot.slot_number,
                Slot.slot_key,
                Slot.slot_value,
                Topic.topic_number,
                Topic.topic_content,
            ).join(Topic).join(Section).join(Project).filter(
                and_(
                    Project.project_id == project_id,
                    Slot.slot_value != None,
                    Slot.slot_value != ""
                )
            ).all()

            filled_slots = []
            for slot in filled_slots_object:
                filled_slots.append({
                    "slot_number": slot.slot_number,
                    "slot_key": slot.slot_key,
                    "slot_value": slot.slot_value,
                    "topic_number": slot.topic_number,
                    "topic_content": slot.topic_content,
                })

            entire_interview_info_slots = {}
            for slot in filled_slots:
                topic_key = f"{slot['topic_number']}: {slot['topic_content']}"

                if topic_key not in entire_interview_info_slots:
                    entire_interview_info_slots[topic_key] = {
                        "slots": []
                    }

                entire_interview_info_slots[topic_key]["slots"].append({
                    "slot_number": slot["slot_number"],
                    "slot_key": slot["slot_key"],
                    "slot_value": slot["slot_value"],
                })


            code, inst, c = StrategySelector.select(db, project_id, current_topic, current_topic_conversation_record)
            base = remarks_generation_prompt.replace("{current_topic_content}", str(current_topic["topic_content"]))
            base = base.replace("{current_topic_conversation_record}", str(current_topic_conversation_record))
            base = base.replace("{topics_list}", str(topics_list))
            base = base.replace("{current_topic_info_slots}", str(current_topic_info_slots))
            base = base.replace("{entire_interview_info_slots}", str(entire_interview_info_slots))
            base = base.replace("{scheduling_log}", str(scheduling_log or ""))
            base = base.replace("{strategy}", str(inst))
            print(f"生成访谈问题的参数:{base}")
            response = await llm_handler.call_llm(prompt=(base))

            remarks = response
            return remarks

        except Exception as e:
            raise e
