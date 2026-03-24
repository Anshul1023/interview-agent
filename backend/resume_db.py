"""
Resume DB — lightweight in-memory + JSON persistence store for candidate resumes.
"""

import json
import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DEFAULT_STORE_PATH = os.getenv("RESUME_STORE_PATH", "data/resumes.json")


class ResumeDB:
    """
    Stores candidate resumes keyed by name.
    Data persists to a JSON file so restarts don't lose context.
    """

    def __init__(self, store_path: str = DEFAULT_STORE_PATH):
        self._path = Path(store_path)
        self._data: dict[str, str] = {}
        self._load()

    # ── Public API ────────────────────────────────────────────────────────────

    def store(self, candidate_name: str, resume_text: str) -> None:
        """Save or update a candidate's resume."""
        key = self._normalise(candidate_name)
        self._data[key] = resume_text.strip()
        self._save()
        logger.info("Resume stored for '%s' (%d chars)", key, len(resume_text))

    def get(self, candidate_name: str) -> Optional[str]:
        """Retrieve a candidate's resume, or None if not found."""
        return self._data.get(self._normalise(candidate_name))

    def delete(self, candidate_name: str) -> bool:
        """Remove a resume. Returns True if it existed."""
        key = self._normalise(candidate_name)
        if key in self._data:
            del self._data[key]
            self._save()
            return True
        return False

    def list_candidates(self) -> list[str]:
        """Return all stored candidate names."""
        return list(self._data.keys())

    # ── Persistence ───────────────────────────────────────────────────────────

    def _load(self) -> None:
        if self._path.exists():
            try:
                self._data = json.loads(self._path.read_text(encoding="utf-8"))
                logger.info("Loaded %d resumes from %s", len(self._data), self._path)
            except Exception as exc:
                logger.warning("Could not load resume store: %s", exc)
                self._data = {}
        else:
            self._path.parent.mkdir(parents=True, exist_ok=True)

    def _save(self) -> None:
        try:
            self._path.write_text(
                json.dumps(self._data, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
        except Exception as exc:
            logger.error("Could not save resume store: %s", exc)

    @staticmethod
    def _normalise(name: str) -> str:
        return name.strip().lower()
