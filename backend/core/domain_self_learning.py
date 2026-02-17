import json
import asyncio
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from database.models import Project, Section, Topic, Slot, DomainExperience
from ..llm_handler import LLMHandler
from ..config import CONFIG
from ..prompts.domain_optimization import domain_optimization_prompt
from ..prompts.domain_ingest import domain_ingest_prompt


class DomainSelfLearner:
    @staticmethod
    def compute_kc_score(db: Session, project_id: int) -> dict:
        topics = db.query(Topic).join(Section).filter(Section.project_id == project_id).all()
        slots = db.query(Slot).join(Topic).join(Section).filter(Section.project_id == project_id).all()
        t_initial = sum(1 for t in topics if t.is_necessary)
        t_dynamic = sum(1 for t in topics if not t.is_necessary)
        s_initial = sum(1 for s in slots if s.is_necessary)
        s_extension = sum(1 for s in slots if not s.is_necessary)
        f_topic = (t_dynamic / max(1, t_initial)) if t_initial > 0 else 0.0
        f_slot = (s_extension / max(1, s_initial)) if s_initial > 0 else 0.0
        score = CONFIG.KC_TOPIC_WEIGHT * f_topic + CONFIG.KC_SLOT_WEIGHT * f_slot
        return {
            "F_topic": round(f_topic, 6),
            "F_slot": round(f_slot, 6),
            "Score_KC": round(score, 6),
            "t_initial": t_initial,
            "t_dynamic": t_dynamic,
            "s_initial": s_initial,
            "s_extension": s_extension,
        }

    @staticmethod
    def build_project_structure(db: Session, project_id: int) -> str:
        sections = db.query(Section).filter(Section.project_id == project_id).order_by(Section.section_id).all()
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
                    "is_necessary": t.is_necessary,
                    "slots": [],
                }
                for r in t.slots:
                    top["slots"].append({
                        "slot_number": r.slot_number,
                        "slot_key": r.slot_key,
                        "slot_value": r.slot_value,
                        "is_necessary": r.is_necessary,
                    })
                sec["topics"].append(top)
            obj.append(sec)
        try:
            return json.dumps(obj, ensure_ascii=False)
        except Exception:
            return str(obj)

    @staticmethod
    async def optimize_domain_experience(db: Session, project_id: int, domain_id: int, llm_config: dict | None, embed_config: dict | None) -> None:
        d = db.query(DomainExperience).filter(DomainExperience.domain_id == domain_id).first()
        if not d:
            return
        project_structure = DomainSelfLearner.build_project_structure(db, project_id)
        if not llm_config or not llm_config.get("api_url") or not llm_config.get("api_key") or not llm_config.get("model_name"):
            return
        llm = LLMHandler(api_url=llm_config["api_url"], api_key=llm_config["api_key"], model_name=llm_config["model_name"])
        response = await llm.call_llm(
            prompt=domain_optimization_prompt
                .replace("{original_domain_experience}", d.domain_experience_content or "")
                .replace("{project_structure}", project_structure)
        )
        optimized = (response or "").strip()
        if optimized:
            d.domain_experience_content = optimized
            d.updated_time = datetime.now(timezone.utc)
            # Recompute embedding if API key configured
            if embed_config and embed_config.get("api_url") and embed_config.get("api_key") and embed_config.get("model_name"):
                handler = LLMHandler(api_url=embed_config["api_url"], api_key=embed_config["api_key"], model_name=embed_config["model_name"])
                vec = await handler.get_embedding(f"{d.domain_name}\n{d.domain_description}\n{optimized}", embedding_api_url=embed_config["api_url"], model_name=embed_config["model_name"]) 
                if vec is not None:
                    try:
                        d.embedding = json.dumps(vec)
                    except Exception:
                        pass
            db.commit()

    @staticmethod
    async def learn_if_contributing(db: Session, project_id: int, llm_config: dict | None, embed_config: dict | None) -> None:
        project = db.query(Project).filter(Project.project_id == project_id).first()
        if not project:
            return
        # Only run when interview completed
        if str(project.project_status) != 'Completed':
            return
        kc = DomainSelfLearner.compute_kc_score(db, project_id)
        try:
            score_kc = float(kc.get("Score_KC", 0.0))
        except Exception:
            score_kc = 0.0
        if score_kc < float(CONFIG.KC_THRESHOLD):
            return
        # If domain_ids exist => optimize; else => ingest from project structure
        domain_ids = []
        if project.domain_ids:
            try:
                domain_ids = json.loads(project.domain_ids)
            except Exception:
                pass
        if domain_ids and len(domain_ids) > 0:
            for did in domain_ids:
                try:
                    await DomainSelfLearner.optimize_domain_experience(db, project_id, int(did), llm_config=llm_config, embed_config=embed_config)
                except Exception:
                    await asyncio.sleep(0)
        else:
            try:
                await DomainSelfLearner.ingest_domain_experience_from_project(db, project_id, llm_config=llm_config, embed_config=embed_config)
            except Exception:
                await asyncio.sleep(0)

    @staticmethod
    async def ingest_domain_experience_from_project(db: Session, project_id: int, llm_config: dict | None, embed_config: dict | None) -> None:
        project = db.query(Project).filter(Project.project_id == project_id).first()
        if not project:
            return
        if not llm_config or not llm_config.get("api_url") or not llm_config.get("api_key") or not llm_config.get("model_name"):
            return
        llm = LLMHandler(api_url=llm_config["api_url"], api_key=llm_config["api_key"], model_name=llm_config["model_name"])
        documents = DomainSelfLearner.build_project_structure(db, project_id)
        domain_name = project.project_name or f"Project-{project_id}"
        domain_description = project.initial_requirements or ""
        prompt = domain_ingest_prompt.replace("{domain_name}", domain_name).replace("{domain_description}", domain_description).replace("{documents}", documents)
        resp = None
        try:
            resp = await llm.call_llm(prompt=prompt)
        except Exception:
            resp = None
        content = ""
        tags = []
        if resp:
            s = (resp or "").strip()
            if s.startswith("```"):
                s = s.strip("`")
                if s.lower().startswith("json\n"):
                    s = s[5:]
            try:
                data = json.loads(s)
            except Exception:
                try:
                    start = s.find("{")
                    end = s.rfind("}")
                    data = json.loads(s[start:end+1])
                except Exception:
                    data = {}
            content = str(data.get("domain_experience_content", "") or "").strip()
            tags = data.get("tags", [])
        if not content:
            return
        d = DomainExperience(
            domain_number=f"domain-{project_id}-{int(datetime.now(timezone.utc).timestamp())}",
            domain_name=domain_name,
            domain_description=domain_description,
            domain_experience_content=content,
            user_id=project.user_id,
            updated_time=datetime.now(timezone.utc),
            tags=(json.dumps(tags, ensure_ascii=False) if isinstance(tags, list) else None),
        )
        db.add(d)
        db.commit()
        db.refresh(d)
        if embed_config and embed_config.get("api_url") and embed_config.get("api_key") and embed_config.get("model_name"):
            handler = LLMHandler(api_url=embed_config["api_url"], api_key=embed_config["api_key"], model_name=embed_config["model_name"])
            vec = await handler.get_embedding(f"{d.domain_name}\n{d.domain_description}\n{d.domain_experience_content}", embedding_api_url=embed_config["api_url"], model_name=embed_config["model_name"])
            if vec is not None:
                try:
                    d.embedding = json.dumps(vec)
                except Exception:
                    d.embedding = None
                db.commit()
        try:
            project.domain_ids = json.dumps([int(d.domain_id)], ensure_ascii=False)
        except Exception:
            project.domain_ids = json.dumps([d.domain_id])
        db.commit()
