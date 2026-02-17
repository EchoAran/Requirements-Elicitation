from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
import json

from database.database import get_db
from database.models import Project, Section, Topic, Message
from ..llm_handler import LLMHandler
from ..config import CONFIG
from ..core.project_prefiller import ProjectPrefiller
from ..core.framework_generator import FrameworkGenerator
from ..core.priority_builder import PriorityBuilder
from ..core.remarks_generator import RemarksGenerator
from ..core.slot_filler import SlotFiller
from ..core.operation_selector import OperationSelector
from ..core.topic_operator import TopicOperator
from ..prompts.affected_topic_detection import affected_topic_detection_prompt

router = APIRouter()

class SafeModel(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

class LLMConfig(SafeModel):
    api_url: str
    api_key: str
    model_name: str

class StartInterviewRequest(SafeModel):
    api_url: str
    api_key: str
    model_name: str

class ReplyRequest(SafeModel):
    api_url: str
    api_key: str
    model_name: str
    text: str

@router.post("/api/projects/{project_id}/initialize")
async def initialize_project_framework(project_id: int, payload: LLMConfig, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    user_id = project.user_id
    llm = LLMHandler(api_url=payload.api_url, api_key=payload.api_key, model_name=payload.model_name)
    try:
        await FrameworkGenerator.generate_framework(db=db, llm_handler=llm, user_id=user_id, user_input=project.initial_requirements, project_id=project_id)
        return {"success": True}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"初始化访谈框架失败: {str(e)}")

@router.post("/api/projects/{project_id}/interview/start")
async def start_interview(project_id: int, payload: StartInterviewRequest, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    llm = LLMHandler(api_url=payload.api_url, api_key=payload.api_key, model_name=payload.model_name)
    first_time = (project.project_status == 'Pending')
    if first_time:
        project.project_status = 'Ongoing'
        db.commit()
    topic = db.query(Topic).join(Section).filter(Section.project_id == project_id, Topic.topic_status == 'Ongoing').order_by(Topic.topic_id).first()
    if not topic:
        chosen_topic_number = None
        if first_time:
            if project.priority_sequence:
                try:
                    stored = json.loads(project.priority_sequence)
                    if isinstance(stored, list) and len(stored) > 0:
                        chosen_topic_number = str(stored[0].get("topic_number") or "")
                except Exception:
                    project.priority_sequence = None
                    db.commit()
            if not chosen_topic_number:
                try:
                    seq = await PriorityBuilder.build(db=db, llm_handler=llm, project_id=project_id)
                    result = []
                    for item in seq:
                        t = db.query(Topic).join(Section).filter(Topic.topic_number == item["topic_number"], Section.project_id == project_id).first()
                        result.append({
                            "topic_number": item["topic_number"],
                            "topic_content": (t.topic_content if t else None),
                            "status": item.get("status"),
                            "core": item.get("core"),
                        })
                    project.priority_sequence = json.dumps(result, ensure_ascii=False)
                    db.commit()
                    if len(result) > 0:
                        chosen_topic_number = str(result[0]["topic_number"])
                except Exception:
                    chosen_topic_number = None
        if chosen_topic_number:
            topic = db.query(Topic).join(Section).filter(Section.project_id == project_id, Topic.topic_number == chosen_topic_number).order_by(Topic.topic_id).first()
        if not topic:
            topic = db.query(Topic).join(Section).filter(Section.project_id == project_id).order_by(Topic.topic_id).first()
            if not topic:
                raise HTTPException(status_code=400, detail="项目无主题")
        topic.topic_status = 'Ongoing'
        db.commit()
    try:
        await ProjectPrefiller.prefill_all_from_initial(db=db, llm_handler=llm, project_id=project_id)
    except Exception:
        pass
    current_topic = {"topic_number": topic.topic_number, "topic_content": topic.topic_content}
    topics_list = [
        {"topic_number": t.topic_number, "topic_content": t.topic_content}
        for t in db.query(Topic).join(Section).filter(Section.project_id == project_id).order_by(Topic.topic_id).all()
    ]
    messages = db.query(Message).filter(Message.topic_id == topic.topic_id).order_by(Message.message_id).all()
    current_topic_conversation_record = []
    round_num = 0
    for m in messages:
        if m.role == 'Interviewer':
            round_num += 1
            current_topic_conversation_record.append({"Round": round_num, "Interviewer": m.message_content})
        else:
            if current_topic_conversation_record:
                current_topic_conversation_record[-1]["Interviewee"] = m.message_content
    last_interviewer = db.query(Message).filter(Message.topic_id == topic.topic_id, Message.role == 'Interviewer').order_by(Message.message_id.desc()).first()
    if last_interviewer is None:
        interviewer_remarks = await RemarksGenerator.generate_remarks(
            db=db,
            llm_handler=llm,
            project_id=project_id,
            current_topic=current_topic,
            current_topic_conversation_record=current_topic_conversation_record,
            topics_list=topics_list,
            scheduling_log="",
        )
        new_msg = Message(role='Interviewer', message_type='Text', message_content=interviewer_remarks, audio_path=None, topic_id=topic.topic_id)
        db.add(new_msg)
        db.commit()
        db.refresh(new_msg)
    else:
        new_msg = last_interviewer
    return {
        "success": True,
        "current_topic": {
            "topic_id": topic.topic_id,
            "topic_number": topic.topic_number,
            "topic_content": topic.topic_content,
            "topic_status": topic.topic_status,
        },
        "message": {
            "message_id": new_msg.message_id,
            "role": new_msg.role,
            "message_type": new_msg.message_type,
            "message_content": new_msg.message_content,
            "created_time": new_msg.created_time.isoformat(),
        },
    }

@router.post("/api/projects/{project_id}/interview/reply")
async def interview_reply(project_id: int, payload: ReplyRequest, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    llm = LLMHandler(api_url=payload.api_url, api_key=payload.api_key, model_name=payload.model_name)
    topic = db.query(Topic).join(Section).filter(Section.project_id == project_id, Topic.topic_status == 'Ongoing').order_by(Topic.topic_id).first()
    if not topic:
        topic = db.query(Topic).join(Section).filter(Section.project_id == project_id).order_by(Topic.topic_id).first()
        if not topic:
            raise HTTPException(status_code=400, detail="项目无主题")
        topic.topic_status = 'Ongoing'
        db.commit()
    user_msg = Message(role='Interviewee', message_type='Text', message_content=payload.text, audio_path=None, topic_id=topic.topic_id)
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)
    messages = (
        db.query(Message)
        .filter(Message.topic_id == topic.topic_id)
        .order_by(Message.message_id)
        .all()
    )
    current_topic_conversation_record = []
    round_num = 0
    for m in messages:
        if m.role == 'Interviewer':
            round_num += 1
            current_topic_conversation_record.append({
                "Round": round_num,
                "Interviewer_id": m.message_id,
                "Interviewer": m.message_content
            })
        else:
            if current_topic_conversation_record:
                current_topic_conversation_record[-1]["Interviewee_id"] = m.message_id
                current_topic_conversation_record[-1]["Interviewee"] = m.message_content
    current_topic = {"topic_number": topic.topic_number, "topic_content": topic.topic_content}
    topics_list = [
        {"topic_number": t.topic_number, "topic_content": t.topic_content}
        for t in db.query(Topic).join(Section).filter(Section.project_id == project_id).order_by(Topic.topic_id).all()
    ]
    try:
        detection_resp = await llm.call_llm(
            prompt=affected_topic_detection_prompt.replace("{current_topic_content}", str(current_topic["topic_content"]))
                                              .replace("{current_topic_conversation_record}", str(current_topic_conversation_record))
                                              .replace("{topics_list}", str(topics_list))
        )
        affected_list = []
        if detection_resp:
            try:
                parsed = json.loads(detection_resp)
                if isinstance(parsed, list):
                    affected_list = [str(x) for x in parsed]
            except json.JSONDecodeError:
                affected_list = []
        if not affected_list:
            affected_list = [current_topic["topic_number"]]
    except Exception:
        affected_list = [current_topic["topic_number"]]
    for tn in affected_list:
        t_obj = (
            db.query(Topic)
            .join(Section)
            .filter(Topic.topic_number == tn, Section.project_id == project_id)
            .first()
        )
        if not t_obj:
            continue
        target = {"topic_number": t_obj.topic_number, "topic_content": t_obj.topic_content}
        await SlotFiller.fill_slot(db=db, llm_handler=llm, project_id=project_id, current_topic=target, current_topic_conversation_record=current_topic_conversation_record)
    op_data = await OperationSelector.select_operation(llm_handler=llm, current_topic=current_topic, current_topic_conversation_record=current_topic_conversation_record, topics_list=topics_list)
    if isinstance(op_data, str):
        op_data = {"best_operation": op_data, "confidence_scores": [{"operation": op_data, "score": 1.0}]}
    best_op = str(op_data.get("best_operation", "maintain_current_topic"))
    best_score = 0.0
    for it in op_data.get("confidence_scores", []):
        if str(it.get("operation")) == best_op:
            try:
                best_score = float(it.get("score", 0.0))
            except Exception:
                best_score = 0.0
            break
    THETA = CONFIG.OPERATION_SELECTION_THETA
    next_topic = None
    scheduling_log = ""
    if best_score >= THETA:
        if best_op == "maintain_current_topic":
            next_topic = await TopicOperator.maintain_current_topic(current_topic)
        elif best_op == "refuse_current_topic_and_switch_another_topic":
            next_topic = await TopicOperator.refuse_current_topic_and_switch_another_topic(db=db, llm_handler=llm, project_id=project_id, current_topic=current_topic, current_topic_conversation_record=current_topic_conversation_record, topics_list=topics_list)
        elif best_op == "refuse_current_topic_and_create_new_topic":
            next_topic = await TopicOperator.refuse_current_topic_and_create_new_topic(db=db, llm_handler=llm, project_id=project_id, current_topic=current_topic, current_topic_conversation_record=current_topic_conversation_record, topics_list=topics_list)
        elif best_op == "refuse_current_topic":
            next_topic = await TopicOperator.refuse_current_topic(db=db, llm_handler=llm, project_id=project_id, current_topic=current_topic, topics_list=topics_list)
        elif best_op == "switch_another_topic":
            next_topic = await TopicOperator.switch_another_topic(db=db, llm_handler=llm, project_id=project_id, current_topic=current_topic, current_topic_conversation_record=current_topic_conversation_record, topics_list=topics_list)
        elif best_op == "create_new_topic":
            next_topic = await TopicOperator.create_new_topic(db=db, llm_handler=llm, project_id=project_id, current_topic=current_topic, current_topic_conversation_record=current_topic_conversation_record, topics_list=topics_list)
        elif best_op == "end_current_topic":
            next_topic = await TopicOperator.end_current_topic(db=db, llm_handler=llm, project_id=project_id, current_topic=current_topic, topics_list=topics_list)
            if next_topic is None:
                project.project_status = 'Completed'
                db.commit()
                end_message = "我们的访谈可以结束了，感谢您抽出时间，现在将生成需求报告。"
                return {
                    "success": True,
                    "end": True,
                    "end_message": end_message,
                    "current_topic": None,
                }
        if next_topic and next_topic.get("topic_number") != current_topic.get("topic_number"):
            scheduling_log = CONFIG.format_scheduling_log(
                best_op,
                best_score,
                current_topic.get("topic_content"),
                next_topic.get("topic_content"),
            )
    else:
        next_topic = current_topic
        scheduling_log = CONFIG.format_scheduling_log(
            best_op,
            best_score,
            current_topic.get("topic_content"),
            None,
        )
    next_messages = (
        db.query(Message)
        .join(Topic, Message.topic_id == Topic.topic_id)
        .join(Section, Topic.section_id == Section.section_id)
        .filter(Topic.topic_number == next_topic["topic_number"], Section.project_id == project_id)
        .order_by(Message.message_id)
        .all()
    )
    current_topic_conversation_record = []
    round_num = 0
    for m in next_messages:
        if m.role == 'Interviewer':
            round_num += 1
            current_topic_conversation_record.append({"Round": round_num, "Interviewer": m.message_content})
        else:
            if current_topic_conversation_record:
                current_topic_conversation_record[-1]["Interviewee"] = m.message_content
    interviewer_remarks = await RemarksGenerator.generate_remarks(db=db, llm_handler=llm, project_id=project_id, current_topic=next_topic, current_topic_conversation_record=current_topic_conversation_record, topics_list=topics_list, scheduling_log=scheduling_log)
    next_topic_obj = db.query(Topic).join(Section).filter(Topic.topic_number == next_topic["topic_number"], Section.project_id == project_id).first()
    new_msg = Message(role='Interviewer', message_type='Text', message_content=interviewer_remarks, audio_path=None, topic_id=next_topic_obj.topic_id)
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)
    return {
        "success": True,
        "current_topic": {
            "topic_id": next_topic_obj.topic_id,
            "topic_number": next_topic_obj.topic_number,
            "topic_content": next_topic_obj.topic_content,
            "topic_status": next_topic_obj.topic_status,
        },
        "message": {
            "message_id": new_msg.message_id,
            "role": new_msg.role,
            "message_type": new_msg.message_type,
            "message_content": new_msg.message_content,
            "created_time": new_msg.created_time.isoformat(),
        },
    }

@router.get("/api/projects/{project_id}/chat")
def get_project_chat(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    ongoing_topic = db.query(Topic).join(Section).filter(Section.project_id == project_id, Topic.topic_status == 'Ongoing').order_by(Topic.topic_id).first()
    if not ongoing_topic:
        if project.project_status == 'Completed':
            ongoing_topic = None
        else:
            ongoing_topic = db.query(Topic).join(Section).filter(Section.project_id == project_id).order_by(Topic.topic_id).first()
            if not ongoing_topic:
                raise HTTPException(status_code=400, detail="项目无主题")
    msgs = (
        db.query(Message, Topic)
        .join(Topic, Message.topic_id == Topic.topic_id)
        .join(Section, Topic.section_id == Section.section_id)
        .filter(Section.project_id == project_id)
        .order_by(Message.created_time, Message.message_id)
        .all()
    )
    return {
        "success": True,
        "current_topic": (
            None if ongoing_topic is None else {
                "topic_id": ongoing_topic.topic_id,
                "topic_number": ongoing_topic.topic_number,
                "topic_content": ongoing_topic.topic_content,
                "topic_status": ongoing_topic.topic_status,
            }
        ),
        "messages": [
            {
                "message_id": m.message_id,
                "role": m.role,
                "message_type": m.message_type,
                "message_content": m.message_content,
                "created_time": m.created_time.isoformat(),
                "topic_id": t.topic_id,
                "topic_number": t.topic_number,
                "topic_content": t.topic_content,
            }
            for (m, t) in msgs
        ],
    }
