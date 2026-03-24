"""
Interview AI Agent — FastAPI Backend
"""

import asyncio
import base64
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel

from stt_service import STTService
from llm_service import LLMService
from screen_service import ScreenService
from resume_db import ResumeDB

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

IGNORE_PHRASES = [
    "thank you", "thanks", "you're welcome", "welcome",
    "okay", "ok", "yes", "no", "hello", "hi", "bye", "goodbye",
    "um", "uh", "hmm", "alright", "right", "sure", "got it",
    "i see", "please", "sorry", "good", "great", "nice",
    "let's get started", "shall we begin", "go ahead",
]

def is_valid_question(text: str) -> bool:
    if not text:
        return False
    t = text.strip().lower()
    words = t.split()
    if len(words) < 4:
        return False
    if len(words) < 7 and any(phrase in t for phrase in IGNORE_PHRASES):
        return False
    return True


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Interview AI Agent…")
    app.state.stt       = STTService()
    app.state.llm       = LLMService()
    app.state.screen    = ScreenService()
    app.state.resume_db = ResumeDB()
    yield


app = FastAPI(title="Interview AI Agent", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Overlay ────────────────────────────────────────────────────────────────────

@app.get("/overlay")
async def serve_overlay():
    overlay_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "overlay.html")
    if not os.path.exists(overlay_path):
        raise HTTPException(status_code=404, detail="overlay.html not found in backend folder")
    return FileResponse(overlay_path, media_type="text/html")


# ── Models ─────────────────────────────────────────────────────────────────────

class ResumeUpload(BaseModel):
    content: str
    candidate_name: str

class AskRequest(BaseModel):
    question: str
    candidate_name: str = "Candidate"
    resume_context: str = ""


# ── REST Endpoints ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/resume")
async def upload_resume(payload: ResumeUpload):
    app.state.resume_db.store(payload.candidate_name, payload.content)
    return {"message": f"Resume stored for {payload.candidate_name}"}


@app.get("/resume/{candidate_name}")
async def get_resume(candidate_name: str):
    data = app.state.resume_db.get(candidate_name)
    if not data:
        raise HTTPException(status_code=404, detail="Resume not found")
    return {"candidate_name": candidate_name, "content": data}


@app.post("/ask")
async def ask_question(payload: AskRequest):
    llm: LLMService = app.state.llm
    resume_db: ResumeDB = app.state.resume_db

    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    resume_ctx = payload.resume_context
    if not resume_ctx and payload.candidate_name:
        resume_ctx = resume_db.get(payload.candidate_name) or ""

    async def stream_tokens():
        try:
            async for token in llm.stream_answer(question=question, resume_context=resume_ctx):
                yield f"data: {token}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: [Error: {e}]\n\n"

    return StreamingResponse(
        stream_tokens(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


# ── Audio WebSocket ────────────────────────────────────────────────────────────

@app.websocket("/ws/audio")
async def audio_websocket(ws: WebSocket):
    await ws.accept()
    stt: STTService = ws.app.state.stt
    llm: LLMService = ws.app.state.llm
    resume_db: ResumeDB = ws.app.state.resume_db

    audio_buffer: list[bytes] = []
    candidate_name: Optional[str] = None

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)

            if msg["type"] == "audio_chunk":
                candidate_name = msg.get("candidate", "Candidate")
                chunk = base64.b64decode(msg["data"])
                audio_buffer.append(chunk)

            elif msg["type"] == "end_audio":
                if not audio_buffer:
                    audio_buffer.clear()
                    continue

                audio_bytes = b"".join(audio_buffer)
                audio_buffer.clear()

                if len(audio_bytes) < 5000:
                    logger.info("Audio too small (%d bytes), skipping", len(audio_bytes))
                    continue

                try:
                    transcript = await stt.transcribe(audio_bytes)
                except Exception as e:
                    logger.error("STT error: %s", e)
                    await ws.send_json({"type": "error", "message": f"STT error: {e}"})
                    continue

                transcript = (transcript or "").strip()
                logger.info("Transcript: '%s'", transcript)

                if not is_valid_question(transcript):
                    logger.info("Ignoring: '%s'", transcript)
                    continue

                await ws.send_json({"type": "transcript", "text": transcript})

                resume_ctx = ""
                if candidate_name:
                    resume_ctx = resume_db.get(candidate_name) or ""

                try:
                    async for token in llm.stream_answer(
                        question=transcript,
                        resume_context=resume_ctx,
                    ):
                        await ws.send_json({"type": "llm_token", "text": token})
                except Exception as e:
                    logger.error("LLM error: %s", e)
                    await ws.send_json({"type": "error", "message": str(e)})
                    continue

                await ws.send_json({"type": "llm_done"})

    except WebSocketDisconnect:
        logger.info("Audio WS disconnected")
    except Exception as exc:
        logger.exception("Audio WS error: %s", exc)
        try:
            await ws.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass


# ── Screen WebSocket ───────────────────────────────────────────────────────────

@app.websocket("/ws/screen")
async def screen_websocket(ws: WebSocket):
    await ws.accept()
    screen: ScreenService = ws.app.state.screen
    llm: LLMService = ws.app.state.llm
    resume_db: ResumeDB = ws.app.state.resume_db

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            if msg["type"] == "screenshot":
                img_bytes = base64.b64decode(msg["data"])
                candidate_name = msg.get("candidate", "Candidate")
                question = await screen.extract_question(img_bytes)
                if not question or not is_valid_question(question):
                    continue
                await ws.send_json({"type": "ocr_question", "text": question})
                resume_ctx = resume_db.get(candidate_name) or ""
                async for token in llm.stream_answer(
                    question=question, resume_context=resume_ctx
                ):
                    await ws.send_json({"type": "llm_token", "text": token})
                await ws.send_json({"type": "llm_done"})
    except WebSocketDisconnect:
        logger.info("Screen WS disconnected")
    except Exception as exc:
        logger.exception("Screen WS error: %s", exc)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)