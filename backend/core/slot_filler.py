import json

from sqlalchemy import and_
from sqlalchemy.orm import Session
from database.models import Slot, Topic, Section, Project
from ..llm_handler import LLMHandler
from ..prompts.slots_filling import slots_filling_prompt

class SlotFiller:
    @staticmethod
    async def fill_slot(db: Session, llm_handler: LLMHandler, project_id: int, current_topic: dict,
                                   current_topic_conversation_record: list) :
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


            # Filling slot
            response = await llm_handler.call_llm(
                prompt=slots_filling_prompt.replace("{current_topic_content}",
                                                               str(current_topic["topic_content"])).replace(
                    "{current_topic_conversation_record}", str(current_topic_conversation_record)).replace(
                    "{current_topic_info_slots}", str(current_topic_info_slots)).replace(
                    "{entire_interview_info_slots}",str(entire_interview_info_slots)))

            try:
                slots = json.loads(response.replace('"slot_value": None','"slot_value": "None"'))
            except json.JSONDecodeError as e:
                raise ValueError(f"Failed to parse LLM response as JSON: {response}") from e

            topic = db.query(Topic).join(Section).filter(
                Topic.topic_number == current_topic["topic_number"],
                Section.project_id == project_id
            ).first()

            if not topic:
                raise ValueError(f"No topic with the topic_number of {current_topic["topic_number"]} was found.")

            topic_id = topic.topic_id

            # Process each slot data
            for slot_data in slots:
                slot_number = slot_data["slot_number"]
                slot_key = slot_data["slot_key"]
                if slot_data["slot_value"] != "None":
                    raw_value = slot_data["slot_value"]
                    if isinstance(raw_value, (list, dict)):
                        slot_value = json.dumps(raw_value, ensure_ascii=False)
                    elif raw_value is None:
                        slot_value = None
                    else:
                        slot_value = str(raw_value)
                else:
                    slot_value = None

                # Evidence is computed by code logic based on current round; LLM does not return it

                # Check if a slot with the same slot_number already exists
                existing_slot = db.query(Slot).filter(
                    Slot.topic_id == topic_id,
                    Slot.slot_number == slot_number
                ).first()

                if existing_slot:
                    # Update the existing slot
                    value_changed = (existing_slot.slot_value != slot_value)
                    if value_changed:
                        existing_slot.slot_value = slot_value
                    existing_evidence = []
                    try:
                        if existing_slot.evidence_message_ids:
                            parsed_existing = json.loads(existing_slot.evidence_message_ids)
                            if isinstance(parsed_existing, list):
                                existing_evidence = parsed_existing
                    except Exception:
                        existing_evidence = []
                    current_round_ids = []
                    if current_topic_conversation_record and len(current_topic_conversation_record) > 0:
                        last_round = current_topic_conversation_record[-1]
                        try:
                            iid = last_round.get("Interviewer_id")
                            if iid is not None:
                                current_round_ids.append(int(iid))
                        except Exception:
                            pass
                        try:
                            aid = last_round.get("Interviewee_id")
                            if aid is not None:
                                current_round_ids.append(int(aid))
                        except Exception:
                            pass
                    merged = []
                    seen = set()
                    for x in existing_evidence + (current_round_ids if value_changed else []):
                        if x not in seen:
                            seen.add(x)
                            merged.append(x)
                    try:
                        new_evidence_value = json.dumps(merged, ensure_ascii=False)
                    except Exception:
                        new_evidence_value = json.dumps(existing_evidence, ensure_ascii=False)
                    if existing_slot.evidence_message_ids != new_evidence_value:
                        existing_slot.evidence_message_ids = new_evidence_value
                else:
                    # Create a new slot
                    current_round_ids = []
                    if current_topic_conversation_record and len(current_topic_conversation_record) > 0:
                        last_round = current_topic_conversation_record[-1]
                        try:
                            iid = last_round.get("Interviewer_id")
                            if iid is not None:
                                current_round_ids.append(int(iid))
                        except Exception:
                            pass
                        try:
                            aid = last_round.get("Interviewee_id")
                            if aid is not None:
                                current_round_ids.append(int(aid))
                        except Exception:
                            pass
                    merged = []
                    seen = set()
                    for x in current_round_ids:
                        if x not in seen:
                            seen.add(x)
                            merged.append(x)
                    try:
                        evidence_value = json.dumps(merged, ensure_ascii=False)
                    except Exception:
                        evidence_value = json.dumps([], ensure_ascii=False)
                    new_slot = Slot(
                        slot_number=slot_number,
                        slot_key=slot_key,
                        slot_value=slot_value,
                        is_necessary=False,  # The newly added slot is set to False.
                        topic_id=topic_id,
                        evidence_message_ids=evidence_value
                    )
                    db.add(new_slot)

            db.commit()

        except Exception as e:
            raise e
