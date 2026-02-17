import json
from ..llm_handler import LLMHandler
from ..prompts.operation_selection import next_operation_selection_prompt

class OperationSelector:

    @staticmethod
    async def select_operation(llm_handler: LLMHandler, current_topic: dict, current_topic_conversation_record: list, topics_list: list) -> object:
        try:
            # generate an interview framework
            response = await llm_handler.call_llm(
                prompt=next_operation_selection_prompt.replace("{current_topic_content}", str(current_topic["topic_content"]))
                                                       .replace("{current_topic_conversation_record}", str(current_topic_conversation_record)).replace("{topics_list}", str(topics_list)))

            r = (response or "").strip()
            if r.startswith("```"):
                r = r.strip("`")
            try:
                data = json.loads(r)
                best = str(data.get("best_operation", "")).strip()
                scores = data.get("confidence_scores", [])
                if best and isinstance(scores, list):
                    return {"best_operation": best, "confidence_scores": scores}
            except Exception:
                pass

            op = r.strip().strip('"').strip("'")
            if not op:
                op = "maintain_current_topic"
            return {"best_operation": op, "confidence_scores": [{"operation": op, "score": 1.0}]}

        except Exception as e:
            raise e
