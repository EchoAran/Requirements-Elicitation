from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import json

from ..llm_handler import LLMHandler
from ..prompts.meta_interview import meta_interview_prompt

router = APIRouter()

class MetaConversationItem(BaseModel):
    role: str
    content: str

class MetaInterviewRequest(BaseModel):
    api_url: str
    api_key: str
    model_name: str
    summary: Optional[Dict[str, Any]] = None
    coverage: Optional[Dict[str, Any]] = None
    conversation: List[MetaConversationItem]
    template_text: Optional[str] = None

@router.post("/api/meta-interview/next")
async def meta_interview_next(payload: MetaInterviewRequest):
    llm = LLMHandler(api_url=payload.api_url, api_key=payload.api_key, model_name=payload.model_name)
    conv_json = json.dumps([{"role": c.role, "content": c.content} for c in payload.conversation], ensure_ascii=False)
    summary_json = json.dumps(payload.summary or {}, ensure_ascii=False)
    coverage_json = json.dumps(payload.coverage or {
        "goal": "未覆盖",
        "users": "未覆盖",
        "functions": "未覆盖",
        "constraints": "未覆盖",
        "acceptance": "未覆盖",
    }, ensure_ascii=False)
    tpl_text = str(payload.template_text or "")
    prompt = (
        meta_interview_prompt
        .replace("{summary}", summary_json)
        .replace("{coverage}", coverage_json)
        .replace("{conversation}", conv_json)
        .replace("{template_text}", tpl_text)
    )
    response = await llm.call_llm(prompt=prompt, query="")
    next_q = response or "请先用一句话说明本项目的核心目标是什么？"
    return {"success": True, "next_question": next_q}
