"""
Objective accuracy tests for the contactless fingerprint pipeline using
synthetic ridge patterns.

A synthetic "fingerprint" is a whorl-like oriented ridge field with per-seed
random flow modulations (unique local structure, like real prints). We assert:

- the quality gate passes ridge images and rejects flat/blurred captures
- a GENUINE pair (same pattern, re-captured with rotation/translation/scale)
  verifies as a match
- IMPOSTOR pairs (different patterns) are rejected
"""
import numpy as np
import cv2
import pytest

from app.fingerprint.enhancement import assess_quality, enhance_fingerprint, ridge_peak_ratio
from app.fingerprint.service import fingerprint_service

# Mirror the production defaults in app/core/config.py
MIN_INLIERS = 25
MIN_RATIO = 0.03


def synth_fingerprint(seed: int, size: int = 400) -> np.ndarray:
    rng = np.random.RandomState(seed)
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    cx = size / 2 + rng.uniform(-40, 40)
    cy = size / 2 + rng.uniform(-40, 40)
    r = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    ang = np.arctan2(y - cy, x - cx)

    freq = 2 * np.pi / 9.0  # ridge wavelength ~9 px
    phase = freq * r
    phase += rng.uniform(2.0, 5.0) * np.sin(ang * rng.randint(1, 4) + rng.uniform(0, 2 * np.pi))
    for _ in range(3):
        fx, fy = rng.uniform(-3, 3) / size, rng.uniform(-3, 3) / size
        phase += rng.uniform(2.0, 6.0) * np.sin(2 * np.pi * (fx * x + fy * y) + rng.uniform(0, 2 * np.pi))

    img = 127 + 100 * np.sin(phase)
    img = cv2.GaussianBlur(img.astype(np.float32), (0, 0), 0.8)
    img += rng.normal(0, 3, img.shape)
    return np.clip(img, 0, 255).astype(np.uint8)


def recapture(img: np.ndarray, angle_deg: float = 6.0, tx: float = 12.0, ty: float = -8.0,
              scale: float = 1.05) -> np.ndarray:
    h, w = img.shape
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle_deg, scale)
    M[0, 2] += tx
    M[1, 2] += ty
    out = cv2.warpAffine(img, M, (w, h), borderValue=127)
    out = cv2.GaussianBlur(out, (0, 0), 0.6)
    return out


class TestQualityGate:
    def test_ridge_image_passes(self):
        q = assess_quality(synth_fingerprint(1))
        assert q.passed, f"hints={q.hints} scores={q.scores}"

    def test_flat_image_fails(self):
        flat = np.full((400, 400), 128, dtype=np.uint8)
        flat = (flat + np.random.RandomState(0).normal(0, 2, flat.shape)).astype(np.uint8)
        q = assess_quality(flat)
        assert not q.passed
        codes = {h["code"] for h in q.hints}
        assert "no_ridges" in codes or "too_blurry" in codes

    def test_blurred_capture_fails(self):
        blurred = cv2.GaussianBlur(synth_fingerprint(2), (0, 0), 8)
        q = assess_quality(blurred)
        assert not q.passed

    def test_ridge_peak_separates(self):
        ridge = ridge_peak_ratio(synth_fingerprint(3))
        flat = ridge_peak_ratio(np.full((400, 400), 128, dtype=np.uint8))
        assert ridge > flat
        assert ridge >= 1.6


class TestEnhancement:
    def test_output_shape_and_range(self):
        enh = enhance_fingerprint(synth_fingerprint(4))
        assert enh.shape == (400, 400)
        assert enh.dtype == np.uint8
        assert enh.min() < 50 and enh.max() > 200  # full-contrast ridge map


class TestMatching:
    def setup_method(self):
        fingerprint_service.initialize()

    def _verify_pair(self, a: np.ndarray, b: np.ndarray) -> dict:
        ea, eb = enhance_fingerprint(a), enhance_fingerprint(b)
        return fingerprint_service.match_templates(ea, eb, MIN_INLIERS, MIN_RATIO)

    def test_genuine_pair_matches(self):
        original = synth_fingerprint(10)
        again = recapture(original)
        r = self._verify_pair(again, original)
        assert r["match"], f"genuine pair rejected: {r}"
        assert r["inliers"] >= MIN_INLIERS

    def test_genuine_larger_rotation_matches(self):
        original = synth_fingerprint(11)
        again = recapture(original, angle_deg=12.0, tx=-15, ty=10, scale=0.95)
        r = self._verify_pair(again, original)
        assert r["match"], f"genuine pair (12deg) rejected: {r}"

    @pytest.mark.parametrize("seed_a,seed_b", [(20, 21), (22, 23), (24, 25)])
    def test_impostor_pairs_rejected(self, seed_a, seed_b):
        r = self._verify_pair(synth_fingerprint(seed_a), synth_fingerprint(seed_b))
        assert not r["match"], f"impostor accepted: {r}"

    def test_identical_image_matches_strongly(self):
        img = synth_fingerprint(30)
        r = self._verify_pair(img, img)
        assert r["match"] and r["inliers"] > 50

    def test_genuine_impostor_separation_margin(self):
        """The decision gap must be wide, not borderline: the weakest genuine
        score must comfortably exceed the strongest impostor score."""
        genuine, impostor = [], []
        for seed in (40, 41, 42, 43):
            orig = synth_fingerprint(seed)
            r = self._verify_pair(recapture(orig, angle_deg=8, tx=10, ty=-6), orig)
            genuine.append(r["inliers"])
        for sa, sb in ((60, 61), (62, 63), (64, 65), (66, 67)):
            r = self._verify_pair(synth_fingerprint(sa), synth_fingerprint(sb))
            impostor.append(r["inliers"])
        assert min(genuine) > 1.5 * max(impostor), f"genuine={genuine} impostor={impostor}"
        assert min(genuine) >= MIN_INLIERS
        assert max(impostor) < MIN_INLIERS
