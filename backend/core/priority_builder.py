import json
import hashlib
from typing import Tuple
from sqlalchemy.orm import Session
from database.models import Topic, Section
from ..llm_handler import LLMHandler
from ..prompts.topic_dependency import topic_dependency_prompt

PRIORITY_CACHE: dict[int, Tuple[str, list[dict]]] = {}

class PriorityBuilder:
    @staticmethod
    async def build(db: Session, llm_handler: LLMHandler, project_id: int) -> list[dict]:
        topics = db.query(Topic).join(Section).filter(Section.project_id == project_id).all()
        data = []
        for t in topics:
            data.append({
                "topic_number": t.topic_number,
                "topic_content": t.topic_content,
                "section_number": t.section.section_number,
                "status": t.topic_status,
            })
        canonical = json.dumps(sorted(data, key=lambda x: x["topic_number"]), ensure_ascii=False)
        digest = hashlib.md5(canonical.encode("utf-8")).hexdigest()
        cached = PRIORITY_CACHE.get(project_id)
        if cached and cached[0] == digest:
            return cached[1]
        resp = await llm_handler.call_llm(prompt=topic_dependency_prompt.replace("{topics}", str(data)))
        try:
            edges = json.loads(resp)
        except Exception:
            edges = []
        
        print(edges)
        
        # Build mapping helpers
        indeg = {}
        for d in data:
            indeg[d["topic_number"]] = 0
        num_set = set(indeg.keys())
        content_to_num = {d["topic_content"]: d["topic_number"] for d in data}

        def resolve_to_number(val: object) -> str | None:
            if val is None:
                return None
            s = str(val).strip()
            if s in num_set:
                return s
            if ":" in s:
                left = s.split(":", 1)[0].strip()
                if left in num_set:
                    return left
            if s in content_to_num:
                return content_to_num[s]
            return None

        for e in edges:
            try:
                tgt_raw = e.get("target")
                tgt = resolve_to_number(tgt_raw)
                if tgt and tgt in indeg:
                    indeg[tgt] += 1
            except Exception:
                continue
        dmax = max(indeg.values()) if indeg else 1
        sections = sorted(list({d["section_number"] for d in data}))
        sn_to_pos = {sn: (i + 1) for i, sn in enumerate(sections)}
        total_sections = len(sections) if sections else 1
        res = []
        for d in data:
            f_dep = 1 - (indeg.get(d["topic_number"], 0) / dmax if dmax > 0 else 0)
            pos = sn_to_pos.get(d["section_number"], 1)
            f_sec = ((total_sections - pos) / (total_sections - 1)) if total_sections > 1 else 1
            core = 0.5 * f_dep + 0.5 * f_sec
            print(f"{d} -> dep:{f_dep:.3f} sec:{f_sec:.3f} core:{core:.3f}")
            res.append({"topic_number": d["topic_number"], "core": core, "status": d["status"]})
        res_sorted = sorted(res, key=lambda x: x["core"], reverse=True)
        PRIORITY_CACHE[project_id] = (digest, res_sorted)
        return res_sorted
