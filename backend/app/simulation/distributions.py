"""
Thin wrappers around numpy.random.Generator that each accept a
DistributionConfig and return a float sample. All callers should
use sample(cfg, rng) → float.
"""
from __future__ import annotations
import numpy as np
from app.models.graph_models import DistributionConfig, DistributionType


def sample(cfg: DistributionConfig, rng: np.random.Generator) -> float:
    t = cfg.type

    if t == DistributionType.fixed:
        return float(cfg.value or 0.0)

    if t == DistributionType.normal:
        # Clamp to 0 so we never return negative times
        return max(0.0, rng.normal(cfg.mean or 1.0, cfg.std or 0.1))

    if t == DistributionType.exponential:
        return rng.exponential(cfg.scale or 1.0)

    if t == DistributionType.triangular:
        lo = cfg.low or 0.0
        hi = cfg.high or 2.0
        mode = cfg.mode if cfg.mode is not None else (lo + hi) / 2.0
        return rng.triangular(lo, mode, hi)

    if t == DistributionType.uniform:
        return rng.uniform(cfg.low or 0.0, cfg.high or 1.0)

    if t == DistributionType.weibull:
        # numpy weibull returns shape-only; scale separately
        shape = cfg.shape or 1.5
        scale = cfg.scale or 1.0
        return scale * rng.weibull(shape)

    if t == DistributionType.lognormal:
        mean = cfg.mean or 0.0
        std = cfg.std or 0.25
        return rng.lognormal(mean, std)

    if t == DistributionType.poisson:
        return float(rng.poisson(cfg.mean or 1.0))

    raise ValueError(f"Unknown distribution type: {t}")
