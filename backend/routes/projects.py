from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from datetime import datetime, timezone
import json

from database.database import get_db
from database.models import User, Project, Section, Topic, Slot, Message
from ..core.info_summarizer import InfoSummarizer
from ..core.domain_self_learning import DomainSelfLearner
from ..llm_handler import LLMHandler
from ..core.framework_generator import FrameworkGenerator

from .interview_flow import router as interview_flow_router
from .structure_management import router as structure_management_router
from .retrieval_fusion import router as retrieval_fusion_router

router = APIRouter()

# ---- Project core endpoints ----

class CreateProjectRequest(BaseModel):
    project_name: str
    initial_requirements: str
    user_id: int | None = None
    domain_ids: list[int] | None = None

class ProjectUpdate(BaseModel):
    project_name: str | None = None
    initial_requirements: str | None = None
    project_status: str | None = None
    interview_report: str | None = None
    domain_ids: list[int] | None = None

class ReportRegenerateRequest(BaseModel):
    llm_api_url: str | None = None
    llm_api_key: str | None = None
    llm_model_name: str | None = None
    embed_api_url: str | None = None
    embed_api_key: str | None = None
    embed_model_name: str | None = None

class CreateAndInitializeRequest(BaseModel):
    project_name: str
    initial_requirements: str
    api_url: str
    api_key: str
    model_name: str
    fused_text: str | None = ""
    user_id: int | None = None
    domain_ids: list[int] | None = None

@router.get("/api/projects")
def list_projects(user_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(Project)
    if user_id is not None:
        query = query.filter(Project.user_id == user_id)
    projects = query.order_by(Project.created_time.desc()).all()
    return {
        "success": True,
        "projects": [
            {
                "project_id": p.project_id,
                "project_name": p.project_name,
                "initial_requirements": p.initial_requirements,
                "created_at": p.created_time.isoformat(),
                "project_status": p.project_status,
                "user_id": p.user_id,
            }
            for p in projects
        ],
    }

@router.post("/api/projects")
def create_project(payload: CreateProjectRequest, db: Session = Depends(get_db)):
    if payload.user_id is None:
        user = db.query(User).first()
        if not user:
            raise HTTPException(status_code=400, detail="未找到用户")
        user_id = user.user_id
    else:
        user_id = payload.user_id
    project = Project(
        project_name=payload.project_name,
        initial_requirements=payload.initial_requirements,
        project_status="Pending",
        interview_report=None,
        user_id=user_id,
        created_time=datetime.now(timezone.utc),
        domain_ids=(json.dumps(payload.domain_ids, ensure_ascii=False) if payload.domain_ids is not None else None),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return {
        "success": True,
        "project": {
            "project_id": project.project_id,
            "project_name": project.project_name,
            "initial_requirements": project.initial_requirements,
            "created_at": project.created_time.isoformat(),
            "project_status": project.project_status,
            "user_id": project.user_id,
            "domain_ids": (json.loads(project.domain_ids) if project.domain_ids else None),
        },
    }

@router.post("/api/projects/create-and-initialize")
async def create_and_initialize(payload: CreateAndInitializeRequest, db: Session = Depends(get_db)):
    if payload.user_id is None:
        user = db.query(User).first()
        if not user:
            raise HTTPException(status_code=400, detail="未找到用户")
        user_id = user.user_id
    else:
        user_id = payload.user_id
    project = Project(
        project_name=payload.project_name,
        initial_requirements=payload.initial_requirements,
        project_status="Pending",
        interview_report=None,
        user_id=user_id,
        created_time=datetime.now(timezone.utc),
        domain_ids=(json.dumps(payload.domain_ids, ensure_ascii=False) if payload.domain_ids is not None else None),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    llm = LLMHandler(api_url=payload.api_url, api_key=payload.api_key, model_name=payload.model_name)
    try:
        await FrameworkGenerator.generate_framework_with_content(db=db, llm_handler=llm, user_input=payload.initial_requirements, project_id=project.project_id, domain_content=(payload.fused_text or ""))
        return {
            "success": True,
            "project": {
                "project_id": project.project_id,
                "project_name": project.project_name,
                "initial_requirements": project.initial_requirements,
                "created_at": project.created_time.isoformat(),
                "project_status": project.project_status,
                "user_id": project.user_id,
            },
        }
    except Exception as e:
        try:
            db.delete(project)
            db.commit()
        except Exception:
            db.rollback()
        raise HTTPException(status_code=500, detail=f"创建并初始化失败: {str(e)}")

@router.patch("/api/projects/{project_id}")
def update_project(project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if payload.project_name is not None:
        project.project_name = payload.project_name
    if payload.initial_requirements is not None:
        project.initial_requirements = payload.initial_requirements
    if payload.project_status is not None:
        project.project_status = payload.project_status
    if payload.interview_report is not None:
        project.interview_report = payload.interview_report
    if payload.domain_ids is not None:
        project.domain_ids = json.dumps(payload.domain_ids, ensure_ascii=False)
    db.commit()
    db.refresh(project)
    return {"success": True}

@router.delete("/api/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    db.delete(project)
    db.commit()
    return {"success": True}

@router.get("/api/projects/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.project_id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    return {
        "success": True,
        "project": {
            "project_id": p.project_id,
            "project_name": p.project_name,
            "initial_requirements": p.initial_requirements,
            "created_at": p.created_time.isoformat(),
            "project_status": p.project_status,
            "user_id": p.user_id,
            "interview_report": p.interview_report,
            "domain_ids": (json.loads(p.domain_ids) if p.domain_ids else None),
        },
    }

@router.post("/api/projects/{project_id}/report/regenerate")
async def regenerate_report(project_id: int, payload: ReportRegenerateRequest | None = None, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    await InfoSummarizer.summarize_info(db=db, project_id=project_id)
    project = db.query(Project).filter(Project.project_id == project_id).first()
    try:
        import asyncio
        llm_cfg = None
        embed_cfg = None
        if payload is not None:
            if payload.llm_api_url and payload.llm_api_key and payload.llm_model_name:
                llm_cfg = {"api_url": payload.llm_api_url, "api_key": payload.llm_api_key, "model_name": payload.llm_model_name}
            if payload.embed_api_url and payload.embed_api_key and payload.embed_model_name:
                embed_cfg = {"api_url": payload.embed_api_url, "api_key": payload.embed_api_key, "model_name": payload.embed_model_name}
        asyncio.create_task(DomainSelfLearner.learn_if_contributing(db=db, project_id=project_id, llm_config=llm_cfg, embed_config=embed_cfg))
    except Exception:
        pass
    return {"success": True, "interview_report": project.interview_report}

@router.get("/api/projects/{project_id}/report/download")
def download_report(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    content = project.interview_report or ""
    headers = {
        "Content-Disposition": f"attachment; filename=project-{project.project_id}-report.md"
    }
    return Response(content=content, media_type="text/markdown; charset=utf-8", headers=headers)

@router.get("/api/projects/{project_id}/chat/download")
def download_chat(project_id: int, db: Session = Depends(get_db)):
    topics = db.query(Topic).join(Section).filter(Section.project_id == project_id).options(
        joinedload(Topic.messages),
    ).order_by(Topic.topic_id).all()
    data = []
    for t in topics:
        # Sort messages by message_id to ensure correct order
        sorted_messages = sorted(t.messages, key=lambda m: m.message_id)
        data.append({
            "topic_number": t.topic_number,
            "topic_content": t.topic_content,
            "messages": [
                {
                    "message_id": m.message_id,
                    "role": m.role,
                    "message_content": m.message_content
                }
                for m in sorted_messages
            ],
        })
    try:
        content = json.dumps({"project_id": project_id, "topics": data}, ensure_ascii=False, indent=2)
    except Exception:
        content = str({"project_id": project_id, "topics": data})
    headers = {"Content-Disposition": f"attachment; filename=project-{project_id}-chat.json"}
    return Response(content=content, media_type="application/json", headers=headers)

@router.get("/api/projects/{project_id}/slots/download")
def download_slots(project_id: int, db: Session = Depends(get_db)):
    sections = db.query(Section).filter(Section.project_id == project_id).options(
        joinedload(Section.topics).joinedload(Topic.slots),
    ).order_by(Section.section_id).all()
    obj = []
    for s in sections:
        sec = {
            "section_number": s.section_number,
            "section_content": s.section_content,
            "topics": [],
        }
        for t in s.topics:
            top = {
                "topic_number": t.topic_number,
                "topic_content": t.topic_content,
                "slots": [
                    {
                        "slot_number": r.slot_number,
                        "slot_key": r.slot_key,
                        "slot_value": r.slot_value,
                        "is_necessary": r.is_necessary,
                        "evidence_message_ids": r.evidence_message_ids,
                    }
                    for r in t.slots
                ],
            }
            sec["topics"].append(top)
        obj.append(sec)
    try:
        content = json.dumps({"project_id": project_id, "sections": obj}, ensure_ascii=False, indent=2)
    except Exception:
        content = str({"project_id": project_id, "sections": obj})
    headers = {"Content-Disposition": f"attachment; filename=project-{project_id}-slots.json"}
    return Response(content=content, media_type="application/json", headers=headers)

# ---- Include other grouped routers ----

router.include_router(interview_flow_router)
router.include_router(structure_management_router)
router.include_router(retrieval_fusion_router)
