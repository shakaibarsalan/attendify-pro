"""
Contactless fingerprint recognition service (camera-based, 1:1 verification).

Enrollment stores several enhanced (binarized ridge-map) templates per user.
Verification enhances the query photo the same way, extracts AKAZE keypoints
on both ridge maps, takes mutual nearest-neighbour matches, and requires a
geometrically consistent near-rigid transform (similarity RANSAC) with enough
inliers. The decision is 1:1 only — "does this finger match THIS user's
enrolled finger" — never 1:N search.
"""
import base64
import logging
from typing import Optional, List

import numpy as np
import cv2
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.fingerprint.enhancement import to_gray, assess_quality, enhance_fingerprint, FingerQuality

logger = logging.getLogger(__name__)

# The biometric DB's initial schema (001) already ships a fingerprint_templates
# table (template_data/finger_position/template_format columns), so we reuse its
# column names. Two legacy constraints must go: UNIQUE(user_id, finger_position)
# allows only ONE sample per finger, but multi-sample enrollment (3-5 captures)
# is core to contactless matching accuracy.
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS fingerprint_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    institution_id UUID,
    finger_position TEXT NOT NULL DEFAULT 'right_index',
    template_data BYTEA NOT NULL,
    template_format TEXT NOT NULL DEFAULT 'ridge_png',
    quality_score DOUBLE PRECISION,
    is_primary BOOLEAN DEFAULT false,
    capture_device TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE fingerprint_templates DROP CONSTRAINT IF EXISTS fingerprint_templates_user_id_finger_position_key;
ALTER TABLE fingerprint_templates DROP CONSTRAINT IF EXISTS fingerprint_templates_finger_position_check;
CREATE INDEX IF NOT EXISTS idx_fp_templates_user ON fingerprint_templates(user_id);
"""


class MatchResult(dict):
    pass


def _affine_sane(M: Optional[np.ndarray]) -> bool:
    """
    Reject implausible transforms between two captures of the same fingertip.
    estimateAffinePartial2D returns a 4-DOF similarity (rotation+scale+shift):
    two captures of one finger should differ by a modest scale change only.
    """
    if M is None:
        return False
    scale = float(np.hypot(M[0, 0], M[1, 0]))
    return 0.5 <= scale <= 2.0


class FingerprintService:
    def __init__(self):
        self._initialized = False
        self._detector = None

    def initialize(self):
        if self._initialized:
            return
        # AKAZE: measured ~2800 keypoints on binarized ridge maps vs ~20 for SIFT
        # (SIFT's edge suppression discards ridge-like structure, which is the
        # entire content of a fingerprint).
        self._detector = cv2.AKAZE_create()
        self._initialized = True
        logger.info("Fingerprint service initialized (contactless, AKAZE/RANSAC 1:1)")

    # ── image handling ─────────────────────────────────────────────

    def decode_image(self, image_data: str) -> Optional[np.ndarray]:
        try:
            if image_data.startswith("data:image"):
                image_data = image_data.split(",")[1]
            arr = np.frombuffer(base64.b64decode(image_data), dtype=np.uint8)
            return cv2.imdecode(arr, cv2.IMREAD_COLOR)
        except Exception:
            return None

    def check_quality(self, image: np.ndarray, settings) -> FingerQuality:
        gray = to_gray(image)
        return assess_quality(
            gray,
            blur_min=settings.fingerprint_blur_min,
            ridge_peak_min=settings.fingerprint_ridge_peak_min,
        )

    def make_template(self, image: np.ndarray) -> np.ndarray:
        return enhance_fingerprint(to_gray(image))

    @staticmethod
    def encode_template(enhanced: np.ndarray) -> bytes:
        ok, buf = cv2.imencode(".png", enhanced)
        if not ok:
            raise ValueError("Could not encode template")
        return buf.tobytes()

    @staticmethod
    def decode_template(blob: bytes) -> Optional[np.ndarray]:
        arr = np.frombuffer(blob, dtype=np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)

    # ── matching ───────────────────────────────────────────────────

    def match_templates(self, query: np.ndarray, stored: np.ndarray,
                        min_inliers: int, min_inlier_ratio: float) -> dict:
        if not self._initialized:
            self.initialize()

        kp_q, des_q = self._detector.detectAndCompute(query, None)
        kp_s, des_s = self._detector.detectAndCompute(stored, None)
        if des_q is None or des_s is None or len(kp_q) < 8 or len(kp_s) < 8:
            return {"match": False, "inliers": 0, "inlier_ratio": 0.0, "good_matches": 0,
                    "reason": "insufficient_keypoints"}

        # Mutual nearest-neighbour matching (cross-check). Lowe's ratio test is the
        # wrong tool on ridge maps: the texture is periodic, so the 2nd-best match
        # is always nearly as close as the best and the test discards genuine
        # correspondences. Cross-check keeps them; geometric RANSAC below does the
        # actual genuine/impostor discrimination. (AKAZE descriptors are binary.)
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        good = bf.match(des_q, des_s)
        if len(good) < 4:
            return {"match": False, "inliers": 0, "inlier_ratio": 0.0, "good_matches": len(good),
                    "reason": "too_few_matches"}

        src = np.float32([kp_q[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        dst = np.float32([kp_s[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
        # 4-DOF similarity transform: far more constrained than a homography, so
        # an impostor cannot accumulate a large geometrically-consistent inlier set.
        M, mask = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC,
                                              ransacReprojThreshold=4.0, confidence=0.999)
        if mask is None or not _affine_sane(M):
            return {"match": False, "inliers": 0, "inlier_ratio": 0.0, "good_matches": len(good),
                    "reason": "no_consistent_geometry"}

        inliers = int(mask.sum())
        ratio = inliers / max(len(good), 1)
        matched = inliers >= min_inliers and ratio >= min_inlier_ratio
        return {"match": matched, "inliers": inliers, "inlier_ratio": round(ratio, 3),
                "good_matches": len(good), "reason": None if matched else "below_threshold"}

    # ── persistence ────────────────────────────────────────────────

    def ensure_table(self, engine):
        try:
            with engine.begin() as conn:
                for stmt in CREATE_TABLE_SQL.strip().split(";"):
                    if stmt.strip():
                        conn.execute(text(stmt))
            logger.info("fingerprint_templates table ready")
        except Exception as e:
            logger.warning(f"Could not ensure fingerprint_templates table: {e}")

    def store_template(self, db: Session, user_id: str, institution_id: Optional[str],
                       finger_position: str, enhanced: np.ndarray, quality_score: float,
                       max_templates: int) -> dict:
        blob = self.encode_template(enhanced)
        row = db.execute(
            text("""INSERT INTO fingerprint_templates
                        (user_id, institution_id, finger_position, template_data, template_format, quality_score, capture_device)
                    VALUES (:uid, CAST(:iid AS uuid), :pos, :tpl, 'ridge_png', :q, 'camera')
                    RETURNING id"""),
            {"uid": user_id, "iid": institution_id, "pos": finger_position, "tpl": blob, "q": quality_score},
        ).fetchone()
        # Keep only the newest N templates per (user, finger) — retention is
        # per finger position so a 4-finger enrolment keeps 5 samples EACH.
        db.execute(
            text("""DELETE FROM fingerprint_templates
                    WHERE user_id = :uid AND finger_position = :pos AND id NOT IN (
                        SELECT id FROM fingerprint_templates
                        WHERE user_id = :uid AND finger_position = :pos
                        ORDER BY created_at DESC LIMIT :keep)"""),
            {"uid": user_id, "pos": finger_position, "keep": max_templates},
        )
        db.commit()
        pos_count = db.execute(
            text("SELECT COUNT(*) FROM fingerprint_templates WHERE user_id = :uid AND finger_position = :pos"),
            {"uid": user_id, "pos": finger_position},
        ).scalar()
        total = db.execute(
            text("SELECT COUNT(*) FROM fingerprint_templates WHERE user_id = :uid"), {"uid": user_id}
        ).scalar()
        return {"template_id": str(row[0]), "position": finger_position,
                "position_count": int(pos_count), "templates_count": int(total)}

    def load_templates(self, db: Session, user_id: str, finger_position: Optional[str] = None) -> List[np.ndarray]:
        if finger_position:
            rows = db.execute(
                text("""SELECT template_data FROM fingerprint_templates
                        WHERE user_id = :uid AND finger_position = :pos ORDER BY created_at DESC"""),
                {"uid": user_id, "pos": finger_position},
            ).fetchall()
        else:
            rows = db.execute(
                text("SELECT template_data FROM fingerprint_templates WHERE user_id = :uid ORDER BY created_at DESC"),
                {"uid": user_id},
            ).fetchall()
        out = []
        for (blob,) in rows:
            img = self.decode_template(bytes(blob))
            if img is not None:
                out.append(img)
        return out

    def templates_count(self, db: Session, user_id: str) -> int:
        return int(db.execute(
            text("SELECT COUNT(*) FROM fingerprint_templates WHERE user_id = :uid"), {"uid": user_id}
        ).scalar() or 0)

    def templates_summary(self, db: Session, user_id: str) -> dict:
        """Per-finger enrolment breakdown for the status endpoint."""
        rows = db.execute(
            text("""SELECT finger_position, COUNT(*) FROM fingerprint_templates
                    WHERE user_id = :uid GROUP BY finger_position"""),
            {"uid": user_id},
        ).fetchall()
        positions = {str(pos): int(c) for pos, c in rows}
        total = sum(positions.values())
        return {
            "positions": positions,
            "enrolled_positions": [p for p, c in positions.items() if c > 0],
            "templates_count": total,
        }

    def delete_templates(self, db: Session, user_id: str) -> int:
        n = db.execute(
            text("DELETE FROM fingerprint_templates WHERE user_id = :uid"), {"uid": user_id}
        ).rowcount
        db.commit()
        return n

    # ── high-level verify ──────────────────────────────────────────

    def verify_finger(self, db: Session, user_id: str, enhanced_query: np.ndarray,
                      finger_position: str, min_inliers: int, min_inlier_ratio: float) -> dict:
        """1:1 match a single finger's query against THAT finger's templates."""
        templates = self.load_templates(db, user_id, finger_position)
        if not templates:
            return {"verified": False, "reason": "not_enrolled", "inliers": 0,
                    "inlier_ratio": 0.0, "good_matches": 0, "templates_count": 0}

        best = {"match": False, "inliers": 0, "inlier_ratio": 0.0}
        for tpl in templates:
            r = self.match_templates(enhanced_query, tpl, min_inliers, min_inlier_ratio)
            if r["inliers"] > best.get("inliers", 0) or (r["match"] and not best.get("match")):
                best = r
            if r["match"]:
                break

        return {
            "verified": bool(best.get("match")),
            "reason": None if best.get("match") else (best.get("reason") or "below_threshold"),
            "inliers": best.get("inliers", 0),
            "inlier_ratio": best.get("inlier_ratio", 0.0),
            "good_matches": best.get("good_matches", 0),
            "templates_count": len(templates),
        }

    # Back-compat: verify against ALL of a user's templates (legacy single-finger).
    def verify(self, db: Session, user_id: str, enhanced_query: np.ndarray,
               min_inliers: int, min_inlier_ratio: float) -> dict:
        return self.verify_finger(db, user_id, enhanced_query, None, min_inliers, min_inlier_ratio)  # type: ignore[arg-type]


fingerprint_service = FingerprintService()
