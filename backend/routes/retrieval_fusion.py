from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from typing import List
import json
import math

from database.database import get_db
from database.models import DomainExperience, Project, Section, Topic, Slot
from ..llm_handler import LLMHandler
from ..config import CONFIG
from ..core.priority_builder import PriorityBuilder
from ..prompts.domain_fusion import domain_fusion_prompt
from ..core.framework_generator import FrameworkGenerator

router = APIRouter()

class SafeModel(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

class RetrievalSuggestRequest(SafeModel):
    api_url: str
    api_key: str
    model_name: str
    threshold: float = CONFIG.RETRIEVAL_COSINE_THRESHOLD
    top_k: int = CONFIG.RETRIEVAL_TOP_K
    user_id: int | None = None

class RetrievalSuggestFromTextRequest(SafeModel):
    api_url: str
    api_key: str
    model_name: str
    text: str
    threshold: float = CONFIG.RETRIEVAL_COSINE_THRESHOLD
    top_k: int = CONFIG.RETRIEVAL_TOP_K
    user_id: int | None = None

class FuseRequest(SafeModel):
    items: List[dict]
    api_url: str | None = None
    api_key: str | None = None
    model_name: str | None = None

class FusedInitializeRequest(SafeModel):
    api_url: str
    api_key: str
    model_name: str
    fused_text: str

class PriorityRequest(SafeModel):
    api_url: str
    api_key: str
    model_name: str

def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    s = 0.0
    na = 0.0
    nb = 0.0
    for i in range(len(a)):
        s += a[i] * b[i]
        na += a[i] * a[i]
        nb += b[i] * b[i]
    den = (math.sqrt(na) * math.sqrt(nb))
    if den == 0:
        return 0.0
    return s / den

def await_or_sync_call_llm(llm: LLMHandler, prompt: str, items: List[dict]) -> str:
    try:
        content = json.dumps(items, ensure_ascii=False)
        resp = llm.call_llm(prompt=prompt.replace("{items}", content), query="")
        if hasattr(resp, "__await__"):
            r = _async_await(resp)
        else:
            r = resp
        return (r or "").strip()
    except Exception:
        return ""

def _async_await(coro):
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)

@router.post("/api/projects/{project_id}/retrieval/suggest")
async def retrieval_suggest(project_id: int, payload: RetrievalSuggestRequest, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    qtext = project.initial_requirements or ""
    llm = LLMHandler(api_url=payload.api_url, api_key=payload.api_key, model_name=payload.model_name)
    qvec = await llm.get_embedding(qtext, embedding_api_url=payload.api_url, model_name=payload.model_name)
    if qvec is None:
        raise HTTPException(status_code=500, detail="项目信息嵌入失败")
    dq = db.query(DomainExperience)
    if payload.user_id is not None:
        dq = dq.filter(DomainExperience.user_id == payload.user_id)
    items = dq.all()
    text_lower = qtext.lower()
    rows = []
    for d in items:
        tags = []
        try:
            if d.tags:
                tags = json.loads(d.tags)
        except Exception:
            tags = []
        matched = [t for t in tags if isinstance(t, str) and t.lower() in text_lower]
        tag_total = len(tags)
        tag_score = (len(matched) / tag_total) if tag_total > 0 else 0.0
        cos = 0.0
        try:
            if d.embedding:
                vec = json.loads(d.embedding)
                if isinstance(vec, list):
                    cos = _cosine(qvec, vec)
        except Exception:
            cos = 0.0
        rows.append({
            "domain_id": d.domain_id,
            "domain_name": d.domain_name,
            "domain_description": d.domain_description,
            "tags": tags,
            "matched_tags": matched,
            "tag_score": tag_score,
            "cosine": cos,
        })
    thr = CONFIG.RETRIEVAL_COSINE_THRESHOLD
    filtered = [r for r in rows if r["tag_score"] > 0 or r["cosine"] >= thr]
    if not filtered:
        filtered = sorted(rows, key=lambda x: x["cosine"], reverse=True)[:payload.top_k]
    max_tag = max((r["tag_score"] for r in filtered), default=0.0)
    max_cos = max((r["cosine"] for r in filtered), default=0.0)
    def norm(x, m):
        return (x / m) if m > 0 else 0.0
    scored = []
    for r in filtered:
        wt = 0.5 * norm(r["tag_score"], max_tag) + 0.5 * norm(r["cosine"], max_cos)
        scored.append({**r, "weight": wt})
    scored = sorted(scored, key=lambda x: x["weight"], reverse=True)
    if len(scored) > payload.top_k:
        scored = scored[:payload.top_k]
    total_w = sum((x["weight"] for x in scored), 0.0)
    for x in scored:
        x["weight"] = (x["weight"] / total_w) if total_w > 0 else 0.0
    matching_domain_ids = [int(r["domain_id"]) for r in scored if r["cosine"] >= thr]
    return {"success": True, "candidates": scored, "threshold_used": thr, "top_k_used": payload.top_k, "matching_domain_ids": matching_domain_ids}

@router.post("/api/retrieval/suggest-text")
async def retrieval_suggest_text(payload: RetrievalSuggestFromTextRequest, db: Session = Depends(get_db)):
    qtext = payload.text or ""
    llm = LLMHandler(api_url=payload.api_url, api_key=payload.api_key, model_name=payload.model_name)
    qvec = await llm.get_embedding(qtext, embedding_api_url=payload.api_url, model_name=payload.model_name)
    if qvec is None:
        raise HTTPException(status_code=500, detail="文本嵌入失败")
    dq = db.query(DomainExperience)
    if payload.user_id is not None:
        dq = dq.filter(DomainExperience.user_id == payload.user_id)
    items = dq.all()
    text_lower = qtext.lower()
    rows = []
    for d in items:
        tags = []
        try:
            if d.tags:
                tags = json.loads(d.tags)
        except Exception:
            tags = []
        matched = [t for t in tags if isinstance(t, str) and t.lower() in text_lower]
        tag_total = len(tags)
        tag_score = (len(matched) / tag_total) if tag_total > 0 else 0.0
        cos = 0.0
        try:
            if d.embedding:
                vec = json.loads(d.embedding)
                if isinstance(vec, list):
                    cos = _cosine(qvec, vec)
        except Exception:
            cos = 0.0
        rows.append({
            "domain_id": d.domain_id,
            "domain_name": d.domain_name,
            "domain_description": d.domain_description,
            "tags": tags,
            "matched_tags": matched,
            "tag_score": tag_score,
            "cosine": cos,
        })
    thr = payload.threshold or CONFIG.RETRIEVAL_COSINE_THRESHOLD
    filtered = [r for r in rows if r["tag_score"] > 0 or r["cosine"] >= thr]
    if not filtered:
        filtered = sorted(rows, key=lambda x: x["cosine"], reverse=True)[:payload.top_k]
    max_tag = max((r["tag_score"] for r in filtered), default=0.0)
    max_cos = max((r["cosine"] for r in filtered), default=0.0)
    def norm(x, m):
        return (x / m) if m > 0 else 0.0
    scored = []
    for r in filtered:
        wt = 0.5 * norm(r["tag_score"], max_tag) + 0.5 * norm(r["cosine"], max_cos)
        scored.append({**r, "weight": wt})
    scored = sorted(scored, key=lambda x: x["weight"], reverse=True)
    if len(scored) > payload.top_k:
        scored = scored[:payload.top_k]
    total_w = sum((x["weight"] for x in scored), 0.0)
    for x in scored:
        x["weight"] = (x["weight"] / total_w) if total_w > 0 else 0.0
    matching_domain_ids = [int(r["domain_id"]) for r in scored if r["cosine"] >= thr]
    return {"success": True, "candidates": scored, "threshold_used": thr, "top_k_used": payload.top_k, "matching_domain_ids": matching_domain_ids}

@router.post("/api/projects/{project_id}/retrieval/fuse")
def retrieval_fuse(project_id: int, payload: FuseRequest, db: Session = Depends(get_db)):
    ids = [int(i.get("domain_id")) for i in payload.items if i.get("domain_id") is not None]
    if not ids:
        return {"success": True, "fused_text": ""}
    ds = db.query(DomainExperience).filter(DomainExperience.domain_id.in_(ids)).all()
    id_to_w = {int(i.get("domain_id")): float(i.get("weight", 0.0)) for i in payload.items}
    ds = [d for d in ds if (id_to_w.get(d.domain_id, 0.0) > 0.0)]
    if not ds:
        return {"success": True, "fused_text": ""}
    if payload.api_url and payload.api_key and payload.model_name:
        llm = LLMHandler(api_url=payload.api_url, api_key=payload.api_key, model_name=payload.model_name)
        items_for_llm = []
        for d in ds:
            items_for_llm.append({
                "domain_id": d.domain_id,
                "domain_name": d.domain_name,
                "weight": id_to_w.get(d.domain_id, 0.0),
                "content": d.domain_experience_content or "",
            })
        try:
            fused_text = await_or_sync_call_llm(llm, domain_fusion_prompt, items_for_llm)
        except Exception:
            ds_sorted = sorted(ds, key=lambda d: id_to_w.get(d.domain_id, 0.0), reverse=True)
            parts = [(d.domain_experience_content or "") for d in ds_sorted]
            fused_text = "\n\n".join(parts)
        return {"success": True, "fused_text": fused_text}
    else:
        ds_sorted = sorted(ds, key=lambda d: id_to_w.get(d.domain_id, 0.0), reverse=True)
        parts = [(d.domain_experience_content or "") for d in ds_sorted]
        fused = "\n\n".join([p for p in parts if p.strip()])
        print(f"融合领域经验\n{fused}")
        return {"success": True, "fused_text": fused}

@router.post("/api/retrieval/fuse")
def retrieval_fuse_global(payload: FuseRequest, db: Session = Depends(get_db)):
    ids = [int(i.get("domain_id")) for i in payload.items if i.get("domain_id") is not None]
    if not ids:
        return {"success": True, "fused_text": ""}
    ds = db.query(DomainExperience).filter(DomainExperience.domain_id.in_(ids)).all()
    id_to_w = {int(i.get("domain_id")): float(i.get("weight", 0.0)) for i in payload.items}
    ds = [d for d in ds if (id_to_w.get(d.domain_id, 0.0) > 0.0)]
    if not ds:
        return {"success": True, "fused_text": ""}
    if payload.api_url and payload.api_key and payload.model_name:
        llm = LLMHandler(api_url=payload.api_url, api_key=payload.api_key, model_name=payload.model_name)
        items_for_llm = []
        for d in ds:
            items_for_llm.append({
                "domain_id": d.domain_id,
                "domain_name": d.domain_name,
                "weight": id_to_w.get(d.domain_id, 0.0),
                "content": d.domain_experience_content or "",
            })
        try:
            fused_text = await_or_sync_call_llm(llm, domain_fusion_prompt, items_for_llm)
        except Exception:
            ds_sorted = sorted(ds, key=lambda d: id_to_w.get(d.domain_id, 0.0), reverse=True)
            parts = [(d.domain_experience_content or "") for d in ds_sorted]
            fused_text = "\n\n".join(parts)
        return {"success": True, "fused_text": fused_text}
    else:
        ds_sorted = sorted(ds, key=lambda d: id_to_w.get(d.domain_id, 0.0), reverse=True)
        parts = [(d.domain_experience_content or "") for d in ds_sorted]
        fused = "\n\n".join([p for p in parts if p.strip()])
        return {"success": True, "fused_text": fused}

@router.post("/api/projects/{project_id}/initialize-with-fused")
async def initialize_with_fused(project_id: int, payload: FusedInitializeRequest, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    llm = LLMHandler(api_url=payload.api_url, api_key=payload.api_key, model_name=payload.model_name)
    try:
        await FrameworkGenerator.generate_framework_with_content(db=db, llm_handler=llm, user_input=project.initial_requirements, project_id=project_id, domain_content=payload.fused_text)
        return {"success": True}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"初始化访谈框架失败: {str(e)}")

@router.post("/api/projects/{project_id}/topics/priority")
async def build_priority(project_id: int, payload: PriorityRequest, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.priority_sequence:
        try:
            stored = json.loads(project.priority_sequence)
            return {"success": True, "priority": stored}
        except Exception:
            project.priority_sequence = None
            db.commit()
    llm = LLMHandler(api_url=payload.api_url, api_key=payload.api_key, model_name=payload.model_name)
    seq = await PriorityBuilder.build(db, llm, project_id)
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
    return {"success": True, "priority": result}
