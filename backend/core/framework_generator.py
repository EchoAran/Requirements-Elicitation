import json
from sqlalchemy.orm import Session
from database.models import DomainExperience, Section, Topic, Slot
from ..llm_handler import LLMHandler
from ..prompts.domain_selection import domain_selection_prompt
from ..prompts.framework_generation import framework_generation_prompt

class FrameworkGenerator:
    @staticmethod
    async def generate_framework(db: Session, llm_handler: LLMHandler, user_id: int, user_input: str, project_id: int):
        try:
            # Match industry experience
            # Retrieve domain experience data based on the user_id
            domains_object = db.query(
                DomainExperience.domain_number,
                DomainExperience.domain_name,
                DomainExperience.domain_description,
                DomainExperience.domain_experience_content
            ).filter(DomainExperience.user_id == user_id).all()
            # It is convenient to establish a dictionary list and a mapping dictionary.
            domains_list = []
            domain_experience_content_map = {}
            for domain_object in domains_object:
                domains_list.append({
                    'domain_number': domain_object.domain_number,
                    'domain_name': domain_object.domain_name,
                    'domain_description': domain_object.domain_description
                })
                domain_experience_content_map[domain_object.domain_number] = domain_object.domain_experience_content
            # Choose a domain
            domain_number =  await llm_handler.call_llm(domain_selection_prompt, f"User's input: {user_input}\n domain_list: {domains_list}")
            domain_number = str(domain_number or "").strip().strip('"').strip("'")
            domain_experience_content = domain_experience_content_map.get(domain_number)
            if not domain_experience_content:
                domain_experience_content = ""

            # generate an interview framework
            response = await llm_handler.call_llm(
                prompt=framework_generation_prompt.replace("{DOMAIN_EXPERIENCE}", domain_experience_content),
                query=f"User's input: {user_input}")

            s = response.strip() if response else ""
            if s.startswith("```"):
                s = s.strip("`")
                if s.lower().startswith("json\n"):
                    s = s[5:]
            try:
                framework = json.loads(s)
            except Exception:
                start = s.find("[")
                end = s.rfind("]")
                if start != -1 and end != -1 and end > start:
                    framework = json.loads(s[start:end+1])
                else:
                    raise ValueError("LLM未返回合法的框架JSON")

            # Write into the database
            for section_data in framework:
                section_number = section_data["section_number"]
                section_content = section_data["section_content"]
                # 创建 section
                section = Section(
                    section_number=section_number,
                    section_content=section_content,
                    project_id=project_id
                )
                db.add(section)
                db.flush()  # Refresh to obtain section_id

                # Traverse the topics under this section
                for topic_data in section_data["topics"]:
                    topic_number = topic_data["topic_number"]
                    topic_content = topic_data["topic_content"]
                    # create topic
                    topic = Topic(
                        topic_number=topic_number,
                        topic_content=topic_content,
                        topic_status="Pending",  # Set all to Pending
                        is_necessary=True,
                        section_id=section.section_id
                    )
                    db.add(topic)
                    db.flush()  # Refresh to obtain the topic_id

                    # Traverse the slots under this topic
                    for slot_data in topic_data["slots"]:
                        slot_number = slot_data["slot_number"]
                        slot_key = slot_data["slot_key"]

                        # create slot
                        slot = Slot(
                            slot_number=slot_number,
                            slot_key=slot_key,
                            slot_value=None,  # All are none.
                            is_necessary=True,  # All are True.
                            topic_id=topic.topic_id
                        )
                        db.add(slot)

            db.commit()
            return True

        except Exception as e:
            db.rollback()
            raise e
    @staticmethod
    async def generate_framework_with_content(db: Session, llm_handler: LLMHandler, user_input: str, project_id: int, domain_content: str):
        try:
            response = await llm_handler.call_llm(
                prompt=framework_generation_prompt.replace("{DOMAIN_EXPERIENCE}", domain_content or ""),
                query=f"User's input: {user_input}")
            s = response.strip() if response else ""
            if s.startswith("```"):
                s = s.strip("`")
                if s.lower().startswith("json\n"):
                    s = s[5:]
            try:
                framework = json.loads(s)
            except Exception:
                start = s.find("[")
                end = s.rfind("]")
                if start != -1 and end != -1 and end > start:
                    framework = json.loads(s[start:end+1])
                else:
                    raise ValueError("LLM未返回合法的框架JSON")
            for section_data in framework:
                section_number = section_data["section_number"]
                section_content = section_data["section_content"]
                section = Section(
                    section_number=section_number,
                    section_content=section_content,
                    project_id=project_id
                )
                db.add(section)
                db.flush()
                for topic_data in section_data["topics"]:
                    topic_number = topic_data["topic_number"]
                    topic_content = topic_data["topic_content"]
                    topic = Topic(
                        topic_number=topic_number,
                        topic_content=topic_content,
                        topic_status="Pending",
                        is_necessary=True,
                        section_id=section.section_id
                    )
                    db.add(topic)
                    db.flush()
                    for slot_data in topic_data["slots"]:
                        slot_number = slot_data["slot_number"]
                        slot_key = slot_data["slot_key"]
                        slot = Slot(
                            slot_number=slot_number,
                            slot_key=slot_key,
                            slot_value=None,
                            is_necessary=True,
                            topic_id=topic.topic_id
                        )
                        db.add(slot)
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            raise e
