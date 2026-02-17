import asyncio
import httpx
from typing import Optional
import json

class LLMHandler:

    def __init__(self, api_url: str, api_key: str, model_name: str):
        self.api_url = api_url
        self.api_key = api_key
        self.model_name = model_name

    def _validate_settings(self) -> bool:
        required_fields = [self.api_url, self.api_key, self.model_name]
        return all(field and field.strip() for field in required_fields)

    async def call_llm(self, prompt: str, query: str = "") -> Optional[str]:
        if not self._validate_settings():
            print("The LLM Settings are incomplete, making it impossible to call the large model")
            return None

        messages = [{"role": "system", "content": prompt}, {"role": "user", "content": query}]
        request_data = {"model": self.model_name, "messages": messages}
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {self.api_key}"}

        attempts = 3
        base_delay = 0.8
        last_error_text = None
        for i in range(attempts):
            print(f"\n[PROMPT] LLM call attempt {i + 1} with prompt: \n{prompt}")
            if query.strip():
                print(f"\n[QUERY] LLM call attempt {i + 1} with query: \n{query}")
            print(f"\n{'---'*40}")
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(self.api_url, json=request_data, headers=headers)
                if response.status_code == 200:
                    result = response.json()
                    if 'choices' in result and len(result['choices']) > 0:
                        print(f"\nLLM response: {result['choices'][0]['message']['content'].strip()}")
                        print(f"\n{'---'*40}")
                        return result['choices'][0]['message']['content'].strip()
                    else:
                        print(f"LLM response format exception: {result}")
                        last_error_text = "format_error"
                    # fallthrough to retry
                else:
                    last_error_text = f"{response.status_code} - {response.text}"
                    print(f"The LLM API call failed: {last_error_text}")
            except httpx.ConnectError as e:
                last_error_text = str(e)
                print(f"The LLM API connection failed: {last_error_text}")
            except httpx.TimeoutException as e:
                last_error_text = str(e)
                print(f"The LLM API request timed out: {last_error_text}")
            except Exception as e:
                last_error_text = f"{str(e)} ({type(e).__name__})"
                print(f"An error occurred when invoking the LLM service: {last_error_text}")
            if i < attempts - 1:
                delay = base_delay * (2 ** i)
                try:
                    await asyncio.sleep(delay)
                except Exception:
                    pass
        return None

    async def get_embedding(self, text: str, embedding_api_url: Optional[str] = None, model_name: Optional[str] = None) -> Optional[list[float]]:
        url = embedding_api_url or "https://api.rcouyi.com/v1/embeddings"
        model = model_name or "text-embedding-3-large"
        data = {"model": model, "input": text}
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {self.api_key}"}
        attempts = 3
        base_delay = 0.8
        for i in range(attempts):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(url, json=data, headers=headers)
                if response.status_code == 200:
                    result = response.json()
                    if "data" in result and len(result["data"]) > 0 and "embedding" in result["data"][0]:
                        return result["data"][0]["embedding"]
                    else:
                        pass
                else:
                    pass
            except httpx.ConnectError:
                pass
            except httpx.TimeoutException:
                pass
            except Exception:
                pass
            if i < attempts - 1:
                delay = base_delay * (2 ** i)
                try:
                    await asyncio.sleep(delay)
                except Exception:
                    pass
        return None

 
