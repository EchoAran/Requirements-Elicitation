import json
from sqlalchemy.orm import Session
from database.models import Slot, Topic, Section, Project
from ..llm_handler import LLMHandler
from ..prompts.initial_slots_filling import initial_slots_filling_prompt


class ProjectPrefiller:
    @staticmethod
    async def prefill_all_from_initial(db: Session, llm_handler: LLMHandler, project_id: int) -> None:
        project = db.query(Project).filter(Project.project_id == project_id).first()
        if not project:
            return
        initial = (project.initial_requirements or "").strip()
        if not initial:
            return

        # Build topics list
        topics = (
            db.query(Topic)
            .join(Section)
            .filter(Section.project_id == project_id)
            .order_by(Topic.topic_id)
            .all()
        )
        topics_list = [
            {"topic_number": t.topic_number, "topic_content": t.topic_content}
            for t in topics
        ]

        # Build slots_by_topic: include current values
        slots_by_topic: dict[str, dict] = {}
        for t in topics:
            ts = (
                db.query(Slot)
                .filter(Slot.topic_id == t.topic_id)
                .order_by(Slot.slot_id)
                .all()
            )
            slots = []
            for s in ts:
                slots.append({
                    "slot_number": s.slot_number,
                    "slot_key": s.slot_key,
                    "slot_value": s.slot_value,
                    "is_necessary": s.is_necessary,
                })
            slots_by_topic[f"{t.topic_number}: {t.topic_content}"] = {"slots": slots}

        prompt = (
            initial_slots_filling_prompt
            .replace("{initial_requirements}", initial)
            .replace("{topics_list}", json.dumps(topics_list, ensure_ascii=False))
            .replace("{slots_by_topic}", json.dumps(slots_by_topic, ensure_ascii=False))
        )
        response = await llm_handler.call_llm(prompt=prompt)
        if not response:
            return
        s = response.strip()
        if s.startswith("```"):
            s = s.strip("`")
            if s.lower().startswith("json\n"):
                s = s[5:]
        try:
            updates = json.loads(s)
        except Exception:
            start = s.find("[")
            end = s.rfind("]")
            if start != -1 and end != -1 and end > start:
                updates = json.loads(s[start:end+1])
            else:
                updates = []

        if not isinstance(updates, list):
            return

        # Apply updates: only update existing slots; do not create new ones
        topic_number_to_id = {t.topic_number: t.topic_id for t in topics}
        for u in updates:
            try:
                tnum = str(u.get("topic_number"))
                snum = str(u.get("slot_number"))
                sval_raw = u.get("slot_value")
                if not tnum or not snum:
                    continue
                tid = topic_number_to_id.get(tnum)
                if not tid:
                    continue
                slot = (
                    db.query(Slot)
                    .filter(Slot.topic_id == tid, Slot.slot_number == snum)
                    .first()
                )
                if not slot:
                    continue
                if sval_raw == "None":
                    new_val = None
                elif isinstance(sval_raw, (list, dict)):
                    new_val = json.dumps(sval_raw, ensure_ascii=False)
                else:
                    new_val = str(sval_raw) if sval_raw is not None else None

                # Update only if value changes or is empty
                if slot.slot_value != new_val:
                    slot.slot_value = new_val
                print("prefill slots is success")
            except Exception:
                continue
        db.commit()
