"""Sentence-transformers wrapper (384-d MiniLM by default)."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Sequence

import numpy as np


@lru_cache(maxsize=1)
def _model():
    from sentence_transformers import SentenceTransformer

    name = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    return SentenceTransformer(name)


def embedding_dim() -> int:
    return int(_model().get_sentence_embedding_dimension())


def encode_texts(texts: Sequence[str], batch_size: int = 32) -> np.ndarray:
    model = _model()
    emb = model.encode(
        list(texts),
        batch_size=batch_size,
        show_progress_bar=len(texts) > 20,
        normalize_embeddings=True,
        convert_to_numpy=True,
    )
    return np.asarray(emb, dtype=np.float32)
