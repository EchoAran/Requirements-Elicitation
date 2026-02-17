from fastapi import APIRouter
from pydantic import BaseModel
import json

from ..llm_handler import LLMHandler
from ..config import CONFIG
from ..prompts.entropy_eval import entropy_eval_prompt

router = APIRouter()

class EntropyEvaluateRequest(BaseModel):
    api_url: str
    api_key: str
    model_name: str
    text: str

@router.post("/api/projects/entropy-evaluate")
async def entropy_evaluate(payload: EntropyEvaluateRequest):
    llm = LLMHandler(api_url=payload.api_url, api_key=payload.api_key, model_name=payload.model_name)
    response = await llm.call_llm(prompt=entropy_eval_prompt, query=payload.text)
    data = {}
    if response:
        s = response.strip()
        if s.startswith("```"):
            s = s.strip("`")
            if s.lower().startswith("json\n"):
                s = s[5:]
        try:
            data = json.loads(s)
        except Exception:
            start = s.find("{")
            end = s.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    data = json.loads(s[start:end+1])
                except Exception:
                    data = {}
    text_len = len(str(data.get("summary", {})).strip())
    length_score = max(0.0, min(1.0, text_len / CONFIG.LENGTH_COEFFICIENT))
    if length_score >= 0.2:
        length_score -= 0.2
    else:
        length_score = 0
    semantic_score = 0
    dimension_scores = data.get("dimension_scores", None)
    if isinstance(dimension_scores, dict):
        for k in ("goal", "users", "functions", "constraints", "acceptance"):
            v = dimension_scores.get(k, 0)
            try:
                semantic_score += int(v)
            except Exception:
                semantic_score += 0
    else:
        semantic_score_raw = data.get("semantic_score", 0)
        try:
            semantic_score = int(semantic_score_raw)
        except Exception:
            semantic_score = 0
    semantic_score = max(0, min(100, semantic_score))
    entropy = round(
        CONFIG.ENTROPY_LENGTH_WEIGHT * length_score
        + CONFIG.ENTROPY_SEMANTIC_WEIGHT * (semantic_score / 100.0),
        4,
    )
    return {
        "success": True,
        "length_score": length_score,
        "semantic_score": semantic_score,
        "entropy": entropy,
        "reason": data.get("reason", ""),
        "coverage": data.get("coverage", {}),
        "summary": data.get("summary", {}),
        "threshold": CONFIG.ENTROPY_THRESHOLD,
    }

@router.get("/api/config")
def get_config_values():
    return {
        "success": True,
        "entropy_threshold": CONFIG.ENTROPY_THRESHOLD,
        "retrieval_cosine_threshold": CONFIG.RETRIEVAL_COSINE_THRESHOLD,
        "retrieval_top_k": CONFIG.RETRIEVAL_TOP_K,
    }
