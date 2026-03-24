import logging
import os
from typing import AsyncGenerator
from groq import AsyncGroq

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a highly intelligent AI assistant like ChatGPT. Answer any question directly and completely.

- Programming/coding questions → explain clearly with working code examples
- DSA questions → give approach + code + time/space complexity O(n)
- System design → give proper architecture with components
- SQL/database questions → give query + explanation
- Behavioral/HR questions (with resume) → answer in first person using STAR method
- Any other question → answer it directly

RULES:
1. Always give a complete direct answer — never refuse
2. For code always include working code
3. For DSA always mention time and space complexity
4. Be concise but thorough"""

BEHAVIORAL_KEYWORDS = [
    "tell me about yourself", "your experience", "your background",
    "your strength", "your weakness", "why should we hire",
    "introduce yourself", "your projects", "your internship",
    "your skills", "worked on", "your role", "your achievement",
]

class LLMService:
    def __init__(self):
        self.client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))
        self.model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

    async def stream_answer(self, question: str, resume_context: str = "") -> AsyncGenerator[str, None]:
        if not question.strip():
            return
        is_behavioral = any(k in question.lower() for k in BEHAVIORAL_KEYWORDS)
        user_content = f"Candidate Resume:\n{resume_context}\n\nInterview Question: {question}" if (resume_context and is_behavioral) else question
        try:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user",   "content": user_content},
                ],
                temperature=0.5,
                max_tokens=1024,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    yield delta.content
        except Exception as exc:
            logger.error("Groq LLM error: %s", exc)
            yield f"[Error: {exc}]"

    async def one_shot_answer(self, question: str, resume_context: str = "") -> str:
        tokens = []
        async for token in self.stream_answer(question, resume_context):
            tokens.append(token)
        return "".join(tokens)