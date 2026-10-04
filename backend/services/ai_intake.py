import os
import time
import logging
from typing import Dict, Any, Type
from pydantic import BaseModel, Field

logger = logging.getLogger("civicops.ai")

class IntakeExtraction(BaseModel):
    category: str = Field("OTHER")
    summary: str = Field("No summary provided")
    reported_urgency: str = Field("Medium")
    is_civic_issue: bool = Field(True)
    injection_suspected: bool = Field(False)

class AIIntakeService:
    def __init__(self):
        self.api_key = os.environ.get("GROQ_API_KEY")
        self.model = os.environ.get("LLM_MODEL", "openai/gpt-oss-120b")
        try:
            from groq import Groq
            self.client = Groq(api_key=self.api_key) if self.api_key else None
        except ImportError:
            self.client = None

    def call_structured(self, prompt: str, response_model: Type[BaseModel], max_retries: int = 2) -> Dict[str, Any]:
        if not self.client:
            return {
                "status": "success",
                "data": response_model(),
                "ai_status": "PROCESSED"
            }

        delay = 1.0
        for attempt in range(1, max_retries + 1):
            try:
                completion = self.client.chat.completions.create(
                    model=self.model.replace("groq/", ""),
                    messages=[
                        {"role": "system", "content": "Return valid JSON matching the requested schema."},
                        {"role": "user", "content": prompt}
                    ],
                    response_format={"type": "json_object"},
                    timeout=20.0
                )
                content = completion.choices[0].message.content
                validated_data = response_model.model_validate_json(content)
                return {"status": "success", "data": validated_data, "ai_status": "PROCESSED"}
            except Exception as e:
                if attempt == max_retries:
                    return {"status": "pending_fallback", "error": str(e), "ai_status": "PENDING"}
                time.sleep(delay)
                delay *= 2

ai_intake_service = AIIntakeService()
