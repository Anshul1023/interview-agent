import io
import logging
import os
from groq import AsyncGroq

logger = logging.getLogger(__name__)

class STTService:
    def __init__(self):
        self.client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))

    async def transcribe(self, audio_bytes: bytes) -> str:
        if not audio_bytes or len(audio_bytes) < 1000:
            return ""
        try:
            audio_file = io.BytesIO(audio_bytes)
            audio_file.name = "audio.webm"
            response = await self.client.audio.transcriptions.create(
                model="whisper-large-v3-turbo",
                file=("audio.webm", audio_file, "audio/webm"),
                language="en",
                response_format="text",
            )
            if isinstance(response, str):
                return response.strip()
            return (getattr(response, "text", "") or "").strip()
        except Exception as exc:
            logger.error("Groq STT error: %s", exc)
            raise