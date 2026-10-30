"""JEV-style decision model adapter.

Primary backend: open-alternative-jev (so1) — an open-source System One style model.
Fallback: a deterministic heuristic scorer that mimics the JEV 20-question structure
so the arena runs even without a GPU/model.
"""
from __future__ import annotations

import os
from typing import Any

try:
    from so1 import Decider, Choice
    SO1_AVAILABLE = True
except Exception:
    SO1_AVAILABLE = False
    Decider = None
    Choice = None


def _heuristic_decision(state_doc: str) -> tuple[str, float, dict]:
    """A lightweight JEV-like scorer using keyword/indicator parsing."""
    text = state_doc.lower()
    score = 0.0
    reasons = {}
    # parse RSI
    import re
    m = re.search(r"rsi14=([\d.]+)", text)
    rsi = float(m.group(1)) if m else 50.0
    m = re.search(r"price vs sma20 = ([-\d.]+)%", text)
    vs20 = float(m.group(1)) if m else 0.0
    m = re.search(r"20d ([-\d.]+)%", text)
    r20 = float(m.group(1)) if m else 0.0

    # scoring (more responsive thresholds for multi-trade simulation)
    if rsi < 45:
        score += 2
        reasons["rsi"] = "oversold" if rsi < 30 else "weak"
    elif rsi > 55:
        score -= 2
        reasons["rsi"] = "overbought" if rsi > 70 else "strong"
    else:
        reasons["rsi"] = "neutral"

    if vs20 < -2:
        score += 1.5
        reasons["trend"] = "below sma20"
    elif vs20 > 2:
        score -= 1.0
        reasons["trend"] = "above sma20"

    if r20 < -3:
        score += 1
        reasons["momentum"] = "negative 20d"
    elif r20 > 3:
        score -= 0.5
        reasons["momentum"] = "positive 20d"

    # map score to action (lower bar -> more trades)
    if score >= 1.5:
        action = "BUY"
    elif score <= -1.5:
        action = "SELL"
    else:
        action = "HOLD"
    conf = min(0.95, 0.5 + abs(score) * 0.1)
    return action, conf, {"score": score, **reasons}


class JEVDecisionModel:
    """Wrapper exposing .decide(state_doc) -> (action, confidence, details)."""

    def __init__(self, model_id: str | None = None, backend: str = "hf",
                 use_so1: bool = True, **kwargs):
        self.model_id = model_id or os.environ.get("SO1_MODEL", "Qwen/Qwen2.5-0.5B-Instruct")
        self.backend = backend
        self.kwargs = kwargs
        self._decider = None
        self.use_so1 = use_so1 and SO1_AVAILABLE

    def _load(self):
        if self._decider is not None:
            return
        if not self.use_so1:
            return
        self._decider = Decider.from_pretrained(self.model_id, backend=self.backend, **self.kwargs)

    def decide(self, state_doc: str) -> tuple[str, float, dict]:
        if self.use_so1:
            try:
                self._load()
                questions = [
                    Choice("overall_action", ["BUY", "HOLD", "SELL"], name="overall_action"),
                    Choice("conviction", ["1", "2", "3", "4", "5"], name="conviction"),
                ]
                decisions = self._decider.decide(state_doc, questions)
                action = decisions[0].choice
                conf = decisions[0].confidence
                conv = decisions[1].choice if len(decisions) > 1 else "3"
                return action, float(conf), {"conviction": conv, "backend": "so1", "model": self.model_id}
            except Exception as e:
                # fall through to heuristic
                pass
        action, conf, details = _heuristic_decision(state_doc)
        details["backend"] = "heuristic"
        return action, conf, details

    @staticmethod
    def available() -> bool:
        return SO1_AVAILABLE

    @staticmethod
    def device_info() -> dict:
        info = {"so1_available": SO1_AVAILABLE, "torch": None, "cuda": False, "mps": False}
        try:
            import torch
            info["torch"] = torch.__version__
            info["cuda"] = bool(torch.cuda.is_available())
            info["mps"] = bool(getattr(torch.backends, "mps", None) and torch.backends.mps.is_available())
            if info["cuda"]:
                info["gpu_name"] = torch.cuda.get_device_name(0)
        except Exception as e:
            info["error"] = str(e)
        return info
