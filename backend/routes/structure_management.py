from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel

from database.database import get_db
from database.models import Section, Topic, Slot

router = APIRouter()

class SectionCreate(BaseModel):
    section_number: str
    section_content: str

class SectionUpdate(BaseModel):
    section_number: str | None = None
    section_content: str | None = None

class TopicCreate(BaseModel):
    topic_number: str
    topic_content: str
    topic_status: str

class TopicUpdate(BaseModel):
    topic_number: str | None = None
    topic_content: str | None = None
    topic_status: str | None = None

class SlotCreate(BaseModel):
    slot_number: str
    slot_key: str
    slot_value: str | None = None
    is_necessary: bool

class SlotUpdate(BaseModel):
    slot_number: str | None = None
    slot_key: str | None = None
    slot_value: str | None = None
    is_necessary: bool | None = None

@router.get("/api/projects/{project_id}/structure")
def get_structure(project_id: int, db: Session = Depends(get_db)):
    sections = db.query(Section).filter(Section.project_id == project_id).options(
        joinedload(Section.topics).joinedload(Topic.slots),
    ).order_by(Section.section_id).all()
    return {
        "success": True,
        "sections": [
            {
                "section_id": s.section_id,
                "section_number": s.section_number,
                "section_content": s.section_content,
                "topics": [
                    {
                        "topic_id": t.topic_id,
                        "topic_number": t.topic_number,
                        "topic_content": t.topic_content,
                        "topic_status": t.topic_status,
                        "is_necessary": t.is_necessary,
                        "slots": [
                            {
                                "slot_id": r.slot_id,
                                "slot_number": r.slot_number,
                                "slot_key": r.slot_key,
                                "slot_value": r.slot_value,
                                "is_necessary": r.is_necessary,
                            }
                            for r in t.slots
                        ],
                    }
                    for t in s.topics
                ],
            }
            for s in sections
        ],
    }

@router.post("/api/projects/{project_id}/sections")
def create_section(project_id: int, payload: SectionCreate, db: Session = Depends(get_db)):
    section = Section(section_number=payload.section_number, section_content=payload.section_content, project_id=project_id)
    db.add(section)
    db.commit()
    db.refresh(section)
    return {"success": True, "section_id": section.section_id}

@router.patch("/api/sections/{section_id}")
def update_section(section_id: int, payload: SectionUpdate, db: Session = Depends(get_db)):
    section = db.query(Section).filter(Section.section_id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="小节不存在")
    if payload.section_number is not None:
        section.section_number = payload.section_number
    if payload.section_content is not None:
        section.section_content = payload.section_content
    db.commit()
    return {"success": True}

@router.delete("/api/sections/{section_id}")
def delete_section(section_id: int, db: Session = Depends(get_db)):
    section = db.query(Section).filter(Section.section_id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="小节不存在")
    db.delete(section)
    db.commit()
    return {"success": True}

@router.post("/api/sections/{section_id}/topics")
def create_topic(section_id: int, payload: TopicCreate, db: Session = Depends(get_db)):
    topic = Topic(topic_number=payload.topic_number, topic_content=payload.topic_content, topic_status=payload.topic_status, section_id=section_id)
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return {"success": True, "topic_id": topic.topic_id}

@router.patch("/api/topics/{topic_id}")
def update_topic(topic_id: int, payload: TopicUpdate, db: Session = Depends(get_db)):
    topic = db.query(Topic).filter(Topic.topic_id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="主题不存在")
    if payload.topic_number is not None:
        topic.topic_number = payload.topic_number
    if payload.topic_content is not None:
        topic.topic_content = payload.topic_content
    if payload.topic_status is not None:
        topic.topic_status = payload.topic_status
    db.commit()
    return {"success": True}

@router.delete("/api/topics/{topic_id}")
def delete_topic(topic_id: int, db: Session = Depends(get_db)):
    topic = db.query(Topic).filter(Topic.topic_id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="主题不存在")
    db.delete(topic)
    db.commit()
    return {"success": True}

@router.post("/api/topics/{topic_id}/slots")
def create_slot(topic_id: int, payload: SlotCreate, db: Session = Depends(get_db)):
    slot = Slot(slot_number=payload.slot_number, slot_key=payload.slot_key, slot_value=payload.slot_value, is_necessary=payload.is_necessary, topic_id=topic_id)
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return {"success": True, "slot_id": slot.slot_id}

@router.patch("/api/slots/{slot_id}")
def update_slot(slot_id: int, payload: SlotUpdate, db: Session = Depends(get_db)):
    slot = db.query(Slot).filter(Slot.slot_id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="槽位不存在")
    if payload.slot_number is not None:
        slot.slot_number = payload.slot_number
    if payload.slot_key is not None:
        slot.slot_key = payload.slot_key
    if payload.slot_value is not None:
        slot.slot_value = payload.slot_value
    if payload.is_necessary is not None:
        slot.is_necessary = payload.is_necessary
    db.commit()
    return {"success": True}

@router.delete("/api/slots/{slot_id}")
def delete_slot(slot_id: int, db: Session = Depends(get_db)):
    slot = db.query(Slot).filter(Slot.slot_id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="槽位不存在")
    db.delete(slot)
    db.commit()
    return {"success": True}

