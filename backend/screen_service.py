import io
import logging
import os
import re
from PIL import Image

logger = logging.getLogger(__name__)

QUESTION_PATTERNS = [
    r"\?\s*$",
    r"^(tell|describe|explain|what|why|how|when|where|who|give|share|walk)",
    r"(experience|strength|weakness|challenge|situation|example|background)",
]

class ScreenService:
    def __init__(self):
        self._last_question: str = ""

    async def extract_question(self, image_bytes: bytes) -> str:
        question = self._tesseract_extract(image_bytes)
        if question and question != self._last_question:
            self._last_question = question
            return question
        return ""

    def _tesseract_extract(self, image_bytes: bytes) -> str:
        try:
            import pytesseract
            img = Image.open(io.BytesIO(image_bytes))
            raw_text = pytesseract.image_to_string(img)
            return self._filter_questions(raw_text)
        except Exception as exc:
            logger.error("Tesseract error: %s", exc)
            return ""

    @staticmethod
    def _filter_questions(text: str) -> str:
        compiled = [re.compile(p, re.IGNORECASE) for p in QUESTION_PATTERNS]
        best_line, best_score = "", 0
        for line in text.splitlines():
            line = line.strip()
            if len(line) < 15:
                continue
            score = sum(1 for pat in compiled if pat.search(line))
            if score > best_score:
                best_score, best_line = score, line
        return best_line if best_score >= 1 else ""
