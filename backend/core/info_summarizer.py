from fastapi import HTTPException
import httpx
from sqlalchemy import and_
from sqlalchemy.orm import Session, joinedload
from database.models import Slot, Topic, Section, Project, Message

class InfoSummarizer:
    @staticmethod
    async def summarize_info(db: Session, project_id: int):
        try:
            # Get project information
            project = db.query(Project).filter(Project.project_id == project_id).first()
            if not project:
                raise ValueError(f"The project with project_id {project_id} was not found")

            # Get all topics in the project and preload the associated slots
            topics = (
                db.query(Topic)
                .join(Section)
                .filter(Section.project_id == project_id)
                .options(joinedload(Topic.slots))
                .order_by(Topic.topic_id)
                .all()
            )

            # Construct data structures grouped by topic
            slots_and_conversation_record = []
            for topic in topics:
                # Building the topic data
                topic_data = {
                    "topic_number": topic.topic_number,
                    "topic_content": topic.topic_content,
                    "messages": [],
                    "slots": []
                }
                # Adding messages (ordered by time)
                msgs = (
                    db.query(Message)
                    .filter(Message.topic_id == topic.topic_id)
                    .order_by(Message.created_time, Message.message_id)
                    .all()
                )
                for message in msgs:
                    topic_data["messages"].append({
                        "role": message.role,
                        "message_content": message.message_content
                    })
                # Adding slots
                for slot in topic.slots:
                    topic_data["slots"].append({
                        "slot_number": slot.slot_number,
                        "slot_key": slot.slot_key,
                        "slot_value": slot.slot_value,
                    })

                slots_and_conversation_record.append(topic_data)

            info = ""
            for slots_and_conversation_record_item in slots_and_conversation_record:
                info += f"{slots_and_conversation_record_item['topic_number']}: {slots_and_conversation_record_item['topic_content']}\n"
                info += f"conversation records:\n"
                round_num = 0
                for message in slots_and_conversation_record_item['messages']:
                    if message['role'] == 'Interviewer':
                        round_num += 1
                        info += f"Round{round_num}\n"
                    info += f"{message['role']}: {message['message_content']}\n"
                info += f"key information:\n"
                for slot in slots_and_conversation_record_item['slots']:
                    info += f"{slot['slot_key']}: {slot['slot_value']}\n"
                info += f"*****\n"

            if info.endswith("*****\n"):
                info = info[:-6]

            # Call an external api to generate a report
            try:
                print(info)
                report_content = await call_report_generation_api(info)
            except HTTPException as e:
                report_content = f"# 需求报告生成失败\n\n{e.detail}"
            # Saving to the database
            project = db.query(Project).filter(Project.project_id == project_id).first()
            if not project:
                raise ValueError(f"The project with project_id {project_id} was not found")
            project.interview_report = report_content
            db.commit()
            db.refresh(project)

        except Exception as e:
            raise e

async def call_report_generation_api(conversation_string: str) -> str:
    """Call an external API to generate a report"""
    api_url = "http://101.35.52.200:8033/generate-prd"

    try:
        async with httpx.AsyncClient(timeout=3000) as client:
            response = await client.post(
                api_url,
                json={"text": conversation_string},
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()
            return response.text
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Failed to connect to report generation API: {str(e)}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Report generation API error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error calling report generation API: {str(e)}")
