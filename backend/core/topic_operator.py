import json
from sqlalchemy.orm import Session
from database.models import Topic, Section, Slot, Project
from ..llm_handler import LLMHandler
from .priority_builder import PriorityBuilder
from ..prompts.topic_selection import topic_selection_prompt
from ..prompts.topic_generation import topic_generation_prompt

class TopicOperator:

    @staticmethod
    async def maintain_current_topic(current_topic: dict) -> dict:
        return current_topic

    # Mark the current topic as a "SystemInterrupted" and redirect to the topic mentioned by the user.
    @staticmethod
    async def switch_another_topic(db: Session, llm_handler: LLMHandler, project_id: int, current_topic: dict, current_topic_conversation_record: list, topics_list: list) -> dict | None:
        try:
            # Select the topic that needs to be switched to
            response = await llm_handler.call_llm(
                prompt=topic_selection_prompt.replace("{current_topic_content}",
                                                               str(current_topic["topic_content"])).replace(
                    "{current_topic_conversation_record}", str(current_topic_conversation_record)).replace("{topics_list}",
                                                                                                           str(topics_list)))
            try:
                selected_topic = json.loads(response)
            except json.JSONDecodeError as e:
                raise ValueError(f"Failed to parse LLM response as JSON: {response}") from e

            if not selected_topic:
                raise ValueError("The LLM has selected the error topic.")

            # Change the status of the replaced topic to "SystemInterrupted"
            current_topic_object = db.query(Topic).join(Section).filter(
                Topic.topic_number == current_topic["topic_number"],
                Section.project_id == project_id
            ).first()
            if not current_topic_object:
                raise ValueError("The current_topic not found")
            current_topic_object.topic_status = "SystemInterrupted"

            # Activate the (selected) topic to be converted
            selected_topic_object = db.query(Topic).join(Section).filter(
                Topic.topic_number == selected_topic["topic_number"],
                Section.project_id == project_id
            ).first()
            if not selected_topic_object:
                raise ValueError("The selected_topic not found")

            selected_topic_object.topic_status = "Ongoing"

            db.commit()
            return selected_topic

        except Exception as e:
            db.rollback()
            raise e

   # Mark the current topic as "SystemInterrupted", create a new topic and switch.
    @staticmethod
    async def create_new_topic(db: Session, llm_handler: LLMHandler, project_id: int, current_topic: dict, current_topic_conversation_record: list, topics_list: list) -> dict:
        try:
            # Query section information
            current_section_object = db.query(
                Section.section_id,
                Section.section_number,
                Section.section_content,
            ).join(Topic, Section.section_id == Topic.section_id).filter(
                Topic.topic_number == current_topic["topic_number"],
                Section.project_id == project_id
            ).first()

            if not current_section_object:
                raise ValueError("The current_section not found")

            current_section = ({
                    'section_number': current_section_object.section_number,
                    'section_content': current_section_object.section_content,
            })

            # Create a new topic
            response = await llm_handler.call_llm(
                prompt=topic_generation_prompt.replace("{current_topic_content}",
                                                      str(current_topic["topic_content"])).replace(
                    "{current_topic_conversation_record}", str(current_topic_conversation_record)).replace("{topics_list}",
                                                                                                           str(topics_list)).replace("{section_content}",str(current_section)))
            try:
                new_topic = json.loads(response)
            except json.JSONDecodeError as e:
                raise ValueError(f"Failed to parse LLM response as JSON: {response}") from e

            # Change the status of the replaced topic to "SystemInterrupted"
            current_topic_object = db.query(Topic).join(Section).filter(
                Topic.topic_number == current_topic["topic_number"],
                Section.project_id == project_id
            ).first()
            if not current_topic_object:
                raise ValueError("The current_topic not found")
            current_topic_object.topic_status = "SystemInterrupted"

            # Store the new topic in the database
            # Insert topic
            topic = Topic(
                topic_number=new_topic["topic_number"],
                topic_content=new_topic["topic_content"],
                topic_status="Ongoing",
                is_necessary=False,
                section_id=current_section_object.section_id
            )
            db.add(topic)
            db.flush()

            # Insert slots
            if "slots" in new_topic:
                for slot_data in new_topic["slots"]:
                    slot = Slot(
                        slot_number=slot_data["slot_number"],
                        slot_key=slot_data["slot_key"],
                        slot_value="",
                        is_necessary=False,
                        topic_id=topic.topic_id
                    )
                    db.add(slot)

            db.commit()
            return  {
                "topic_number": topic.topic_number,
                "topic_content": topic.topic_content
            }

        except Exception as e:
            db.rollback()
            raise e

    # Mark the current topic as "Completed" and switch to the new topic in sequence.
    @staticmethod
    async def end_current_topic(db: Session, llm_handler: LLMHandler, project_id: int, current_topic: dict, topics_list: list) -> dict | None:
        try:
            # Change the status of the replaced topic to "Completed"
            current_topic_object = db.query(Topic).join(Section).filter(
                Topic.topic_number == current_topic["topic_number"],
                Section.project_id == project_id
            ).first()
            if not current_topic_object:
                raise ValueError("The current_topic not found")
            current_topic_object.topic_status = "Completed"

            # Find the position of the current topic in the list
            current_index = -1
            for i, topic in enumerate(topics_list):
                if topic.get("topic_number") == current_topic["topic_number"]:
                    current_index = i
                    break

            # If the current topic is not found, return None.
            if current_index == -1:
                return None

            next_topic = None
            project = db.query(Project).filter(Project.project_id == project_id).first()
            seq = []
            if project and project.priority_sequence:
                try:
                    parsed = json.loads(project.priority_sequence)
                    if isinstance(parsed, list):
                        seq = parsed
                except Exception:
                    seq = []
            for item in seq:
                topic = db.query(Topic).join(Section).filter(
                    Topic.topic_number == item.get("topic_number"),
                    Section.project_id == project_id
                ).first()
                if topic and topic.topic_status in ["Pending", "SystemInterrupted"]:
                    next_topic = topic
                    break

            # If found, update the status
            if next_topic:
                next_topic.topic_status = "Ongoing"
                db.commit()
                db.refresh(next_topic)
                print(f"Found and updated the next topic in the 'Pending' status: {next_topic.topic_number}")
                return {
                        "topic_number": next_topic.topic_number,
                        "topic_content": next_topic.topic_content,
                        "topic_status": next_topic.topic_status,
                        "topic_id": next_topic.topic_id,
                        "section_id": next_topic.section_id
                    }
            else:
                return None

        except Exception as e:
            db.rollback()
            raise e

    # Mark the current topic as "UserInterrupted" and switch to the new topic in sequence.
    @staticmethod
    async def refuse_current_topic(db: Session, llm_handler: LLMHandler, project_id: int, current_topic: dict, topics_list: list) -> dict | None:
        # Change the status of the replaced topic to "UserInterrupted"
        current_topic_object = db.query(Topic).join(Section).filter(
            Topic.topic_number == current_topic["topic_number"],
            Section.project_id == project_id
        ).first()
        if current_topic_object:
            current_topic_object.topic_status = "UserInterrupted"
            db.commit()

        try:
            # Find the position of the current topic in the list
            current_index = -1
            for i, topic in enumerate(topics_list):
                if topic.get("topic_number") == current_topic["topic_number"]:
                    current_index = i
                    break

            # If the current topic is not found, return None.
            if current_index == -1:
                return None

            # Use stored priority sequence to select next Pending/SystemInterrupted topic
            next_topic = None
            project = db.query(Project).filter(Project.project_id == project_id).first()
            seq = []
            if project and project.priority_sequence:
                try:
                    parsed = json.loads(project.priority_sequence)
                    if isinstance(parsed, list):
                        seq = parsed
                except Exception:
                    seq = []
            for item in seq:
                topic = db.query(Topic).join(Section).filter(
                    Topic.topic_number == item.get("topic_number"),
                    Section.project_id == project_id
                ).first()
                if topic and topic.topic_status in ["Pending", "SystemInterrupted"]:
                    next_topic = topic
                    break

            # If found, update the status
            if next_topic:
                next_topic.topic_status = "Ongoing"
                db.commit()
                db.refresh(next_topic)
                print(f"Found and updated the next topic in the 'Pending' status: {next_topic.topic_number}")
                return {
                    "topic_number": next_topic.topic_number,
                    "topic_content": next_topic.topic_content,
                    "topic_status": next_topic.topic_status,
                    "topic_id": next_topic.topic_id,
                    "section_id": next_topic.section_id
                }
            else:
                print("No subsequent topic with the status of 'Pending' was found.")
                return None

        except Exception as e:
            db.rollback()
            raise e

    # Mark the current topic as a "UserInterrupted" and redirect to the topic mentioned by the user.
    @staticmethod
    async def refuse_current_topic_and_switch_another_topic(db: Session, llm_handler: LLMHandler, project_id: int, current_topic: dict, current_topic_conversation_record: list, topics_list: list) -> dict | None:
        try:
            # Select the topic that needs to be switched to
            response = await llm_handler.call_llm(
                prompt=topic_selection_prompt.replace("{current_topic_content}",
                                                      str(current_topic["topic_content"])).replace(
                    "{current_topic_conversation_record}", str(current_topic_conversation_record)).replace("{topics_list}",
                                                                                                           str(topics_list)))
            try:
                selected_topic = json.loads(response)
            except json.JSONDecodeError as e:
                raise ValueError(f"Failed to parse LLM response as JSON: {response}") from e

            if not selected_topic:
                raise ValueError("The LLM has selected the error topic.")

            # Change the status of the replaced topic to "SystemInterrupted"
            current_topic_object = db.query(Topic).join(Section).filter(
                Topic.topic_number == current_topic["topic_number"],
                Section.project_id == project_id
            ).first()
            if not current_topic_object:
                raise ValueError("The current_topic not found")
            current_topic_object.topic_status = "UserInterrupted"

            # Activate the (selected) topic to be converted
            selected_topic_object = db.query(Topic).join(Section).filter(
                Topic.topic_number == selected_topic["topic_number"],
                Section.project_id == project_id
            ).first()
            if not selected_topic_object:
                raise ValueError("The selected_topic not found")
            selected_topic_object.topic_status = "Ongoing"

            db.commit()
            return selected_topic

        except Exception as e:
            db.rollback()
            raise e

    # Mark the current topic as "UserInterrupted", create a new topic and switch.
    @staticmethod
    async def refuse_current_topic_and_create_new_topic(db: Session, llm_handler: LLMHandler, project_id: int, current_topic: dict, current_topic_conversation_record: list, topics_list: list) -> dict | None:
        try:
            # Query section information
            current_section_object = db.query(
                Section.section_id,
                Section.section_number,
                Section.section_content,
            ).join(Topic, Section.section_id == Topic.section_id).filter(
                Topic.topic_number == current_topic["topic_number"],
                Section.project_id == project_id
            ).first()

            if not current_section_object:
                raise ValueError("The current_section not found")
            current_section = ({
                'section_number': current_section_object.section_number,
                'section_content': current_section_object.section_content,
            })

            # Create a new topic
            response = await llm_handler.call_llm(
                prompt=topic_generation_prompt.replace("{current_topic_content}",
                                                       str(current_topic["topic_content"])).replace(
                    "{current_topic_conversation_record}", str(current_topic_conversation_record)).replace("{topics_list}",
                                                                                                           str(topics_list)).replace(
                    "{section_content}", str(current_section)))
            try:
                new_topic = json.loads(response)
            except json.JSONDecodeError as e:
                raise ValueError(f"Failed to parse LLM response as JSON: {response}") from e

            # Change the status of the replaced topic to "SystemInterrupted"
            current_topic_object = db.query(Topic).join(Section).filter(
                Topic.topic_number == current_topic["topic_number"],
                Section.project_id == project_id
            ).first()
            if not current_topic_object:
                raise ValueError("The current_topic not found")
            current_topic_object.topic_status = "UserInterrupted"

            # Store the new topic in the database
            # Insert topic
            topic = Topic(
                topic_number=new_topic["topic_number"],
                topic_content=new_topic["topic_content"],
                topic_status="Ongoing",
                is_necessary=False,
                section_id=current_section_object.section_id
            )
            db.add(topic)
            db.flush()
            # Insert slots
            if "slots" in new_topic:
                for slot_data in new_topic["slots"]:
                    slot = Slot(
                        slot_number=slot_data["slot_number"],
                        slot_key=slot_data["slot_key"],
                        slot_value="",
                        is_necessary=False,
                        topic_id=topic.topic_id
                    )
                    db.add(slot)

            db.commit()
            return {
                "topic_number": topic.topic_number,
                "topic_content": topic.topic_content
            }

        except Exception as e:
            db.rollback()
            raise e
