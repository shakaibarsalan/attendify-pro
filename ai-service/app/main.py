import asyncio
import time
import logging
import uuid
import cv2
import numpy as np
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Header, Request
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, List

from app.core.config import get_settings
from app.core.database import get_db
from app.face.service import face_service
from app.face.liveness import liveness_service
from app.fingerprint.service import fingerprint_service
from app.embeddings.service import embedding_service
from app.face.anti_spoof import AntiSpoofDetector, get_anti_spoof_detector
from app.face.quality import check_quality

logger = logging.getLogger(__name__)

anti_spoof: Optional[AntiSpoofDetector] = None
model_status = {
    "face_detector": False,
    "arcface_buffalo_l": False,
    "anti_spoof_depth": False,
    "anti_spoof_texture": False,
    "anti_spoof_motion": False,
    "mediapipe_liveness": False,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global anti_spoof, model_status
    settings = get_settings()

    face_service.initialize()
    model_status["face_detector"] = True
    model_status["arcface_buffalo_l"] = face_service.face_analyzer is not None

    # Warm the detection graph so the FIRST student's "center your face" guidance
    # isn't blocked by ONNX cold-start (lazy graph optimization/allocation on the
    # first inference, ~1-2s). The guidance loop is the demo-critical path.
    try:
        _warm = np.zeros((640, 640, 3), dtype=np.uint8)
        face_service.detect_only(_warm)
    except Exception as e:
        logger.warning(f"Face detector warmup skipped: {e}")

    anti_spoof = AntiSpoofDetector(
        model_dir=settings.anti_spoof_model_dir,
        threshold=settings.anti_spoof_threshold,
    )
    anti_spoof.initialize()
    model_status["anti_spoof_depth"] = anti_spoof.depth._landmarker is not None
    model_status["anti_spoof_texture"] = True
    model_status["anti_spoof_motion"] = True

    liveness_service.initialize()
    model_status["mediapipe_liveness"] = liveness_service.face_landmarker is not None or liveness_service.face_mesh is not None

    fingerprint_service.initialize()
    # Self-healing schema: the biometric DB only runs initdb migrations on first
    # boot, so make sure the fingerprint table exists on already-initialized DBs.
    from app.core.database import engine
    fingerprint_service.ensure_table(engine)
    embedding_service.ensure_schema(engine)

    logger.info(f"AI Service started. Models: {model_status}")
    yield


app = FastAPI(
    title="Attendify AI Service",
    description="Face recognition, anti-spoofing, and biometric verification service",
    version="2.0.0",
    lifespan=lifespan,
)

API_KEY = get_settings().ai_service_api_key

# Deterministic per-subject id so an external customer's subjectRef maps to a stable
# face_embeddings.user_id (re-enrolling the same subject replaces, not duplicates).
_SUBJECT_NS = uuid.UUID("6f5a7c1e-0000-4000-8000-000000000001")


def _subject_user_id(institution_id: str, subject_ref: str) -> str:
    return str(uuid.uuid5(_SUBJECT_NS, f"{institution_id}:{subject_ref}"))


async def verify_api_key(x_api_key: Optional[str] = Header(None)):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return True


@app.get("/health")
async def health():
    return {"status": "ok", "service": "attendify-ai", "version": "2.0.0"}


@app.get("/api/v1/health/deep")
async def deep_health(db: Session = Depends(get_db)):
    db_ok = False
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass
    return {
        "status": "ok" if db_ok else "degraded",
        "version": "2.0.0",
        "models": model_status,
        "all_models_loaded": all(model_status.values()),
        "anti_spoof_method": anti_spoof.method_name if anti_spoof else "not_initialized",
        "database": {"biometric_db": "connected" if db_ok else "error"},
    }


class FaceRegisterRequest(BaseModel):
    userId: str
    institutionId: Optional[str] = None
    faceImage: str
    qualityThreshold: float = 0.5


class FaceVerifyRequest(BaseModel):
    userId: Optional[str] = None
    institutionId: Optional[str] = None
    faceImage: str
    sessionId: Optional[str] = None
    requireLiveness: bool = False


class MultiFrameVerifyRequest(BaseModel):
    userId: str
    institutionId: Optional[str] = None
    frames: List[str] = Field(..., min_length=3, max_length=5)
    sessionId: Optional[str] = None


class LivenessChallengeRequest(BaseModel):
    userId: Optional[str] = None
    sessionId: Optional[str] = None


class LivenessChallengeVerifyRequest(BaseModel):
    sessionId: str
    token: str
    expectedChallenges: List[str]
    frames: List[str]


class LivenessVerifyRequest(BaseModel):
    sessionId: str
    challengeId: str
    responseImages: list[str]


class LivenessCheckRequest(BaseModel):
    challenges: List[str]
    frames: List[str]


class FaceDetectRequest(BaseModel):
    faceImage: str


@app.post("/api/v1/face/detect", dependencies=[Depends(verify_api_key)])
async def detect_face_endpoint(request: FaceDetectRequest):
    settings = get_settings()
    image = await asyncio.to_thread(face_service.decode_image, request.faceImage)
    if image is None:
        return {"detected": False, "centered": False, "qualityOk": False, "hints": [{"id": "no-face", "text": "No face detected", "type": "warning"}]}

    # Detection-only: this endpoint just drives real-time "center your face"
    # guidance, so it must stay cheap and responsive. Running the recognition
    # embedding here (detect_and_embed) saturated the single-VM CPU and made
    # guidance time out — the user saw no feedback at all. detect_only skips it.
    result = await asyncio.to_thread(face_service.detect_only, image)
    if result is None:
        return {"detected": False, "centered": False, "qualityOk": False, "hints": [{"id": "no-face", "text": "No face detected", "type": "warning"}]}

    bbox, _score = result
    h, w = int(image.shape[0]), int(image.shape[1])
    face_cx = float(bbox[0] + bbox[2]) / 2
    face_cy = float(bbox[1] + bbox[3]) / 2
    img_cx, img_cy = float(w) / 2, float(h) / 2
    offset_x = float(abs(face_cx - img_cx) / img_cx)
    offset_y = float(abs(face_cy - img_cy) / img_cy)
    centered = bool(offset_x < 0.25 and offset_y < 0.25)

    face_area = float((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]))
    img_area = float(h * w)
    area_pct = float((face_area / img_area) * 100)
    quality_ok = bool(area_pct >= settings.quality_min_face_area_pct and area_pct <= settings.quality_max_face_area_pct)

    hints_list = []
    if not centered:
        hints_list.append({"id": "center", "text": "Center your face", "type": "warning"})
    if not quality_ok:
        if area_pct < settings.quality_min_face_area_pct:
            hints_list.append({"id": "quality", "text": "Move closer for better quality", "type": "warning"})
        else:
            hints_list.append({"id": "quality", "text": "Move back slightly", "type": "warning"})
    if centered and quality_ok:
        hints_list.append({"id": "good", "text": "Looking great \u2713", "type": "success"})

    return {"detected": True, "centered": centered, "qualityOk": quality_ok, "hints": hints_list}


@app.post("/api/v1/face/register", dependencies=[Depends(verify_api_key)])
async def register_face(request: FaceRegisterRequest, db: Session = Depends(get_db)):
    start = time.time()
    settings = get_settings()

    if not face_service.face_analyzer:
        raise HTTPException(status_code=503, detail="Face recognition model unavailable; cannot register embedding")

    image = await asyncio.to_thread(face_service.decode_image, request.faceImage)
    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image data")

    result = await asyncio.to_thread(face_service.detect_and_embed, image)
    if result is None:
        raise HTTPException(status_code=400, detail="No face detected in image")

    embedding, bbox, meta = result

    quality_report = check_quality(
        image, bbox,
        blur_threshold=settings.quality_blur_threshold,
        min_face_area_pct=settings.quality_min_face_area_pct,
        max_face_area_pct=settings.quality_max_face_area_pct,
    )
    if not quality_report.passed:
        issues = [f"{i.code}: {i.message}" for i in quality_report.issues]
        raise HTTPException(status_code=400, detail=f"Quality check failed: {'; '.join(issues)}")

    spoof_result = await asyncio.to_thread(anti_spoof.predict, image, bbox) if anti_spoof else None
    if spoof_result and not spoof_result.is_real:
        embedding_service.log_verification(
            db, request.userId, request.institutionId, "spoof", None,
            "spoof_detected", spoof_result.confidence, 0, int((time.time() - start) * 1000),
            metadata={"spoof_scores": spoof_result.raw_scores, "method": spoof_result.method},
        )
        raise HTTPException(
            status_code=400,
            detail=f"Spoof detected (confidence={spoof_result.confidence:.2f}, method={spoof_result.method})",
        )

    stored = await asyncio.to_thread(
        embedding_service.store_face_embedding,
        db, request.userId, request.institutionId, embedding, meta["quality"], True,
    )

    return {
        "success": True,
        "embedding_id": stored["id"],
        "quality_score": meta["quality"],
        "quality_report": {"passed": quality_report.passed, "scores": quality_report.scores},
        "spoof_check": {"passed": True, "method": spoof_result.method if spoof_result else "not_available"},
        "processing_time_ms": int((time.time() - start) * 1000),
    }


@app.post("/api/v1/face/verify", dependencies=[Depends(verify_api_key)])
async def verify_face(request: FaceVerifyRequest, db: Session = Depends(get_db)):
    start = time.time()
    logger.warning("DEPRECATED: /face/verify called - use /face/verify-multi for production")

    image = await asyncio.to_thread(face_service.decode_image, request.faceImage)
    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image data")

    result = await asyncio.to_thread(face_service.detect_and_embed, image)
    if result is None:
        embedding_service.log_verification(
            db, request.userId, request.institutionId, "face", request.sessionId,
            "no_match", 0, 0, int((time.time() - start) * 1000),
        )
        raise HTTPException(status_code=400, detail="No face detected in image")

    query_embedding, bbox, meta = result

    spoof_result = await asyncio.to_thread(anti_spoof.predict, image, bbox) if anti_spoof else None

    stored_embeddings = await asyncio.to_thread(
        embedding_service.find_matching_faces,
        db, query_embedding, request.institutionId,
        get_settings().match_threshold, 5,
    )

    if not stored_embeddings:
        embedding_service.log_verification(
            db, request.userId, request.institutionId, "face", request.sessionId,
            "no_match", 0, 0, int((time.time() - start) * 1000),
            metadata={"spoof": spoof_result.raw_scores if spoof_result else None},
        )
        raise HTTPException(status_code=403, detail="No matching face found", headers={"X-Verify-Reason": "no_match"})

    best_match = stored_embeddings[0]
    verified = best_match["similarity"] >= get_settings().match_threshold

    if request.userId and best_match["user_id"] != request.userId:
        verified = False

    if spoof_result and not spoof_result.is_real:
        verified = False

    embedding_service.log_verification(
        db, request.userId, request.institutionId, "face", request.sessionId,
        "match" if verified else "no_match", best_match["similarity"], 0,
        int((time.time() - start) * 1000),
        best_match_user_id=best_match["user_id"], best_match_score=best_match["similarity"],
        metadata={
            "spoof": {"is_real": spoof_result.is_real, "confidence": spoof_result.confidence} if spoof_result else None,
            "deprecated_endpoint": True,
        },
    )

    return {
        "verified": verified,
        "confidence": best_match["similarity"],
        "matched_user_id": best_match["user_id"],
        "all_matches": stored_embeddings[:5],
        "spoof_check": {
            "is_real": spoof_result.is_real, "confidence": spoof_result.confidence, "method": spoof_result.method,
        } if spoof_result else None,
        "processing_time_ms": int((time.time() - start) * 1000),
        "deprecation_warning": "Use POST /api/v1/face/verify-multi for anti-spoof protected verification",
    }


@app.post("/api/v1/face/verify-multi", dependencies=[Depends(verify_api_key)])
async def verify_face_multi(request: MultiFrameVerifyRequest, req: Request, db: Session = Depends(get_db)):
    start = time.time()
    settings = get_settings()

    if not face_service.face_analyzer:
        raise HTTPException(status_code=503, detail="Face recognition model unavailable")

    content_length = req.headers.get("content-length")
    if content_length and int(content_length) > settings.max_payload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Payload exceeds {settings.max_payload_mb}MB limit")

    if len(request.frames) < settings.multi_frame_min_frames or len(request.frames) > settings.multi_frame_max_frames:
        raise HTTPException(
            status_code=400,
            detail=f"Must provide {settings.multi_frame_min_frames}-{settings.multi_frame_max_frames} frames",
        )

    try:
        images = await asyncio.wait_for(
            asyncio.to_thread(_decode_frames, request.frames),
            timeout=settings.inference_timeout_s,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=408, detail="Frame decoding timed out")

    if len(images) < settings.multi_frame_min_frames:
        raise HTTPException(status_code=400, detail="Could not decode enough frames")

    frame_diffs = _compute_frame_diffs(images)

    static_frames = [d for d in frame_diffs if d < settings.static_diff_threshold]
    if len(static_frames) > len(frame_diffs) * settings.static_frame_ratio:
        embedding_service.log_verification(
            db, request.userId, request.institutionId, "spoof", request.sessionId,
            "no_match", 0, 0, int((time.time() - start) * 1000),
            metadata={"reason": "static_replay_detected", "frame_diffs": frame_diffs},
        )
        return {
            "verified": False, "confidence": 0, "reason": "static_replay_detected",
            "spoof_score": 0, "details": {"frame_diffs": frame_diffs},
        }

    frame_results = await asyncio.to_thread(_process_frames, images, settings)

    faces_detected = sum(1 for r in frame_results if r["face_detected"])
    if faces_detected < len(frame_results) * 0.8:
        return {
            "verified": False, "confidence": 0, "reason": "face_not_detected_in_enough_frames",
            "spoof_score": 0, "details": {"faces_detected": faces_detected, "total_frames": len(frame_results)},
        }

    spoof_passes = sum(1 for r in frame_results if r.get("spoof_result") and r["spoof_result"]["is_real"])
    spoof_score = spoof_passes / max(len(frame_results), 1)
    if spoof_score < 0.8:
        embedding_service.log_verification(
            db, request.userId, request.institutionId, "spoof", request.sessionId,
            "no_match", spoof_score, 0, int((time.time() - start) * 1000),
            metadata={"reason": "anti_spoof_failed", "spoof_score": spoof_score},
        )
        return {
            "verified": False, "confidence": spoof_score, "reason": "anti_spoof_failed",
            "spoof_score": spoof_score, "details": {"frame_results": _summarize(frame_results)},
        }

    embeddings = [r["embedding"] for r in frame_results if r["embedding"] is not None]
    if len(embeddings) < 2:
        return {
            "verified": False, "confidence": 0, "reason": "insufficient_embeddings",
            "spoof_score": spoof_score, "details": {"embeddings_extracted": len(embeddings)},
        }

    consistency_threshold = settings.embedding_consistency_threshold
    if not face_service.face_analyzer:
        consistency_threshold = 0.3

    pair_sims = []
    for i in range(1, len(embeddings)):
        sim = float(np.dot(embeddings[i - 1], embeddings[i]))
        pair_sims.append(sim)

    min_sim = min(pair_sims) if pair_sims else 0
    avg_sim = sum(pair_sims) / len(pair_sims) if pair_sims else 0

    if min_sim < consistency_threshold:
        embedding_service.log_verification(
            db, request.userId, request.institutionId, "spoof", request.sessionId,
            "no_match", min_sim, 0, int((time.time() - start) * 1000),
            metadata={"reason": "embedding_inconsistency", "pair_sims": [round(s, 4) for s in pair_sims], "min_sim": min_sim, "avg_sim": avg_sim},
        )
        return {
            "verified": False, "confidence": min_sim, "reason": "embedding_inconsistency",
            "spoof_score": spoof_score,
            "details": {"pair_sims": [round(s, 4) for s in pair_sims], "min_sim": min_sim, "avg_sim": avg_sim, "threshold": settings.embedding_consistency_threshold},
        }

    mean_embedding = np.mean(embeddings, axis=0)
    norm = np.linalg.norm(mean_embedding)
    if norm > 0:
        mean_embedding = mean_embedding / norm

    recognition_threshold = settings.recognition_threshold
    if not face_service.face_analyzer:
        recognition_threshold = 0.3

    stored_matches = await asyncio.to_thread(
        embedding_service.find_matching_faces,
        db, mean_embedding, request.institutionId, recognition_threshold, 5,
    )

    if not stored_matches:
        embedding_service.log_verification(
            db, request.userId, request.institutionId, "face_multi", request.sessionId,
            "no_match", 0, spoof_score, int((time.time() - start) * 1000),
            metadata={"reason": "no_stored_match", "frames_processed": len(frame_results)},
        )
        return {
            "verified": False, "confidence": 0, "reason": "no_stored_match",
            "spoof_score": spoof_score, "details": {"frames_processed": len(frame_results)},
        }

    best = stored_matches[0]
    verified = best["similarity"] >= recognition_threshold

    if request.userId and best["user_id"] != request.userId:
        verified = False

    # 1:N ambiguity guard: if a different user's primary embedding is within
    # `recognition_margin` of the best match, the identification is too close to
    # trust (lookalikes / low-quality capture). find_matching_faces filters to one
    # primary per user, so stored_matches[1] is guaranteed a different user.
    ambiguous = False
    if verified and len(stored_matches) >= 2:
        runner_up = stored_matches[1]
        if runner_up["user_id"] != best["user_id"] and (best["similarity"] - runner_up["similarity"]) < settings.recognition_margin:
            verified = False
            ambiguous = True

    reason = None
    if not verified:
        if ambiguous:
            reason = "ambiguous_match"
        elif best["user_id"] != request.userId:
            reason = "identity_mismatch"
        else:
            reason = "low_confidence"

    embedding_service.log_verification(
        db, request.userId, request.institutionId, "face_multi", request.sessionId,
        "match" if verified else "no_match", best["similarity"], spoof_score,
        int((time.time() - start) * 1000),
        best_match_user_id=best["user_id"], best_match_score=best["similarity"],
        metadata={
            "spoof_score": spoof_score,
            "frame_count": len(frame_results),
            "frame_diffs": frame_diffs,
            "method": "multi_frame",
        },
    )

    return {
        "verified": verified,
        "confidence": best["similarity"],
        "reason": reason,
        "spoof_score": spoof_score,
        "matched_user_id": best["user_id"],
        "processing_time_ms": int((time.time() - start) * 1000),
        "details": {
            "frames_processed": len(frame_results),
            "faces_detected": faces_detected,
            "spoof_passes": spoof_passes,
            "frame_diffs": [round(d, 2) for d in frame_diffs],
            "best_similarity": best["similarity"],
        },
    }


def _decode_frames(frames_b64: List[str]) -> list:
    images = []
    for f in frames_b64:
        img = face_service.decode_image(f)
        if img is not None:
            images.append(img)
    return images


def _compute_frame_diffs(images: list) -> list:
    diffs = []
    for i in range(1, len(images)):
        gray_prev = cv2.cvtColor(images[i - 1], cv2.COLOR_BGR2GRAY) if len(images[i - 1].shape) == 3 else images[i - 1]
        gray_curr = cv2.cvtColor(images[i], cv2.COLOR_BGR2GRAY) if len(images[i].shape) == 3 else images[i]
        if gray_prev.shape != gray_curr.shape:
            h = min(gray_prev.shape[0], gray_curr.shape[0])
            w = min(gray_prev.shape[1], gray_curr.shape[1])
            gray_prev = gray_prev[:h, :w]
            gray_curr = gray_curr[:h, :w]
        diff = cv2.absdiff(gray_prev, gray_curr)
        diffs.append(float(np.mean(diff)))
    return diffs


def _process_frames(images: list, settings) -> list:
    results = []
    spoof_det = get_anti_spoof_detector()
    prev_image = None
    for img in images:
        r = {"face_detected": False, "embedding": None, "spoof_result": None, "quality": None}
        detect = face_service.detect_and_embed(img)
        if detect is None:
            prev_image = None
            results.append(r)
            continue
        r["face_detected"] = True
        embedding, bbox, meta = detect

        quality = check_quality(
            img, bbox,
            blur_threshold=settings.quality_blur_threshold,
            min_face_area_pct=settings.quality_min_face_area_pct,
            max_face_area_pct=settings.quality_max_face_area_pct,
        )
        r["quality"] = {"passed": quality.passed, "scores": quality.scores}
        r["embedding"] = embedding

        spoof = spoof_det.predict(img, bbox, prev_image=prev_image)
        r["spoof_result"] = {"is_real": spoof.is_real, "confidence": spoof.confidence, "method": spoof.method}
        prev_image = img

        results.append(r)
    return results


def _summarize(frame_results: list) -> list:
    return [
        {"face": r["face_detected"], "spoof": r.get("spoof_result", {}).get("is_real"), "quality": r.get("quality", {}).get("passed")}
        for r in frame_results
    ]


@app.post("/api/v1/face/liveness/challenge", dependencies=[Depends(verify_api_key)])
async def get_liveness_challenge(request: LivenessChallengeRequest):
    return liveness_service.generate_challenge(user_id=request.userId, session_id=request.sessionId)


@app.post("/api/v1/face/liveness/verify", dependencies=[Depends(verify_api_key)])
async def verify_liveness(request: LivenessChallengeVerifyRequest, db: Session = Depends(get_db)):
    start = time.time()
    images = []
    for img_data in request.frames:
        img = face_service.decode_image(img_data)
        if img is not None:
            images.append(img)

    result = liveness_service.verify_challenge(
        session_id=request.sessionId,
        token=request.token,
        frames=images,
        expected_challenges=request.expectedChallenges,
    )

    embedding_service.log_verification(
        db, None, None, "face_liveness", request.sessionId,
        "match" if result.passed else "liveness_failed",
        result.score, result.score, result.processing_time_ms,
        metadata={"challenge_details": result.challenge_details, "reason": result.reason},
    )

    return {
        "passed": result.passed,
        "score": result.score,
        "reason": result.reason,
        "processing_time_ms": result.processing_time_ms,
        "challenge_details": result.challenge_details,
    }


@app.post("/api/v1/face/liveness/check", dependencies=[Depends(verify_api_key)])
async def check_liveness_gesture(request: LivenessCheckRequest):
    """Non-destructive early-advance probe: reports whether the requested gesture(s)
    are already present in the given frames, so the client can advance a challenge
    the moment it's completed instead of waiting the full window. Does NOT consume
    or mutate the liveness session — authoritative verification still happens in
    /liveness/verify (at attendance-mark time)."""
    images = []
    for img_data in request.frames:
        img = face_service.decode_image(img_data)
        if img is not None:
            images.append(img)
    detected = liveness_service.check_gestures(request.challenges, images)
    # Return a LIST (challenge as a string VALUE, not a key) so the web client's
    # camelCasing interceptor can't mangle gesture names like "turn_left".
    return {"results": [
        {"challenge": c, "detected": detected.get(c, {}).get("detected", False), "score": detected.get(c, {}).get("score", 0.0)}
        for c in request.challenges
    ]}


@app.post("/api/v1/face/liveness/verify-legacy", dependencies=[Depends(verify_api_key)])
async def verify_liveness_legacy(request: LivenessVerifyRequest):
    raise HTTPException(status_code=410, detail="This endpoint has been removed. Use POST /api/v1/face/liveness/verify instead.")


class FingerCapture(BaseModel):
    position: str
    image: str


class FingerprintRegisterRequest(BaseModel):
    userId: str
    institutionId: Optional[str] = None
    fingers: Optional[List[FingerCapture]] = None
    # Legacy single-finger fields (treated as one 'index' capture).
    fingerImage: Optional[str] = None
    fingerPosition: Optional[str] = "index"


class FingerprintVerifyRequest(BaseModel):
    userId: str
    institutionId: Optional[str] = None
    fingers: Optional[List[FingerCapture]] = None
    fingerImage: Optional[str] = None
    fingerPosition: Optional[str] = "index"
    sessionId: Optional[str] = None


# Accepted finger labels. Registration captures BOTH hands (left_* and right_*);
# verification matches one hand against ALL of the user's enrolled fingers.
_BASE_FINGERS = {"index", "middle", "ring", "pinky", "thumb"}
VALID_FINGERS = _BASE_FINGERS | {f"left_{f}" for f in _BASE_FINGERS} | {f"right_{f}" for f in _BASE_FINGERS}


def _collect_fingers(request) -> List[tuple]:
    """Normalise either the multi-finger `fingers` list or the legacy single
    `fingerImage` into a list of (position, image) pairs."""
    if request.fingers:
        out = []
        for f in request.fingers:
            pos = f.position if f.position in VALID_FINGERS else "index"
            out.append((pos, f.image))
        return out
    if request.fingerImage:
        return [(request.fingerPosition or "index", request.fingerImage)]
    return []


@app.post("/api/v1/fingerprint/register", dependencies=[Depends(verify_api_key)])
async def register_fingerprint(request: FingerprintRegisterRequest, db: Session = Depends(get_db)):
    start = time.time()
    settings = get_settings()
    captures = _collect_fingers(request)
    if not captures:
        raise HTTPException(status_code=400, detail="No fingerprint images provided")

    def work():
        stored, failed = [], []
        for pos, img in captures:
            image = fingerprint_service.decode_image(img)
            if image is None:
                failed.append({"position": pos, "error": "invalid_image",
                               "hints": [{"code": "invalid", "message": "Could not read the image"}]})
                continue
            quality = fingerprint_service.check_quality(image, settings)
            if not quality.passed:
                failed.append({"position": pos, "error": "quality_failed",
                               "hints": quality.hints, "scores": quality.scores})
                continue
            enhanced = fingerprint_service.make_template(image)
            res = fingerprint_service.store_template(
                db, request.userId, request.institutionId, pos, enhanced,
                quality.scores.get("ridge_peak_ratio", 0.0), settings.fingerprint_max_templates,
            )
            stored.append({"position": pos, "position_count": res["position_count"],
                           "quality": quality.scores})
        return stored, failed

    stored, failed = await asyncio.to_thread(work)
    total = await asyncio.to_thread(fingerprint_service.templates_count, db, request.userId)

    if not stored:
        # Every finger failed the quality gate — surface the hints to the client.
        raise HTTPException(status_code=400, detail={
            "error": "quality_failed",
            "stored": [],
            "failed": failed,
            "hints": failed[0].get("hints", []) if failed else [],
        })

    return {
        "success": True,
        "stored": stored,
        "failed": failed,
        "enrolled_positions": sorted({s["position"] for s in stored}),
        "templates_count": total,
        "processing_time_ms": int((time.time() - start) * 1000),
    }


@app.post("/api/v1/fingerprint/verify", dependencies=[Depends(verify_api_key)])
async def verify_fingerprint(request: FingerprintVerifyRequest, db: Session = Depends(get_db)):
    start = time.time()
    settings = get_settings()
    captures = _collect_fingers(request)
    if not captures:
        raise HTTPException(status_code=400, detail="No fingerprint images provided")

    def work():
        per_finger = []
        for pos, img in captures:
            image = fingerprint_service.decode_image(img)
            if image is None:
                per_finger.append({"position": pos, "verified": False, "reason": "invalid_image"})
                continue
            quality = fingerprint_service.check_quality(image, settings)
            if not quality.passed:
                per_finger.append({"position": pos, "verified": False, "reason": "quality_failed",
                                   "hints": quality.hints, "scores": quality.scores})
                continue
            enhanced = fingerprint_service.make_template(image)
            # Match each captured finger against ALL of the user's enrolled fingers
            # (position=None), so registering both hands but presenting ONE hand at
            # check-in still matches. It also gives the matcher more chances.
            r = fingerprint_service.verify_finger(
                db, request.userId, enhanced, None,
                settings.fingerprint_match_min_inliers, settings.fingerprint_match_min_inlier_ratio,
            )
            per_finger.append({"position": pos, **r})
        return per_finger

    per_finger = await asyncio.to_thread(work)

    matched = [f for f in per_finger if f.get("verified")]
    required = max(1, settings.fingerprint_verify_min_fingers)
    verified = len(matched) >= required
    all_not_enrolled = all(f.get("reason") == "not_enrolled" for f in per_finger)
    reason = None if verified else ("not_enrolled" if all_not_enrolled else "below_threshold")
    best_ratio = max([f.get("inlier_ratio", 0.0) for f in per_finger] or [0.0])

    embedding_service.log_verification(
        db, request.userId, request.institutionId, "fingerprint", request.sessionId,
        "match" if verified else "no_match",
        best_ratio, 0, int((time.time() - start) * 1000),
        metadata={"matched_count": len(matched), "required": required,
                  "reason": reason, "fingers": per_finger},
    )

    return {
        "verified": verified,
        "matched_count": len(matched),
        "matched_positions": [f["position"] for f in matched],
        "required": required,
        "reason": reason,
        "fingers": per_finger,
        "templates_count": await asyncio.to_thread(fingerprint_service.templates_count, db, request.userId),
        "processing_time_ms": int((time.time() - start) * 1000),
    }


@app.get("/api/v1/fingerprint/{user_id}/status", dependencies=[Depends(verify_api_key)])
async def fingerprint_status(user_id: str, db: Session = Depends(get_db)):
    summary = await asyncio.to_thread(fingerprint_service.templates_summary, db, user_id)
    return {
        "user_id": user_id,
        "templates_count": summary["templates_count"],
        "positions": summary["positions"],
        "enrolled_positions": summary["enrolled_positions"],
        "registered": summary["templates_count"] > 0,
    }


@app.delete("/api/v1/fingerprint/{user_id}", dependencies=[Depends(verify_api_key)])
async def delete_fingerprint(user_id: str, db: Session = Depends(get_db)):
    n = await asyncio.to_thread(fingerprint_service.delete_templates, db, user_id)
    return {"success": True, "deleted": n}


@app.get("/api/v1/embeddings/{user_id}", dependencies=[Depends(verify_api_key)])
async def get_user_embeddings(user_id: str, db: Session = Depends(get_db)):
    embeddings = await asyncio.to_thread(embedding_service.get_face_embeddings, db, user_id, True)
    return {"user_id": user_id, "embeddings_count": len(embeddings), "has_primary": any(e["is_primary"] for e in embeddings)}


@app.delete("/api/v1/embeddings/{user_id}", dependencies=[Depends(verify_api_key)])
async def delete_user_embeddings(user_id: str, db: Session = Depends(get_db)):
    db.execute(text("DELETE FROM face_embeddings WHERE user_id = :user_id"), {"user_id": user_id})
    db.commit()
    return {"success": True, "message": "All embeddings deleted for user"}


# ════════════════════════════════════════════════════════════════════════════
#  Public Biometric API — face recognition as a service for external systems.
#  Subjects are the customer's own users (subjectRef), isolated per institution.
# ════════════════════════════════════════════════════════════════════════════

class BiometricEnrollRequest(BaseModel):
    institutionId: str
    subjectRef: str
    image: str
    antiSpoof: bool = True


class BiometricVerifyRequest(BaseModel):
    institutionId: str
    subjectRef: str
    image: str
    antiSpoof: bool = True


class BiometricIdentifyRequest(BaseModel):
    institutionId: str
    image: str
    antiSpoof: bool = True


def _decode_detect_spoof(image_b64: str, run_spoof: bool = True):
    """Shared pipeline: decode -> detect+embed -> (optional) anti-spoof. Raises
    HTTPException on any failure; returns (embedding, bbox, meta, image)."""
    if not face_service.face_analyzer:
        raise HTTPException(status_code=503, detail="Face recognition model unavailable")
    image = face_service.decode_image(image_b64)
    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image data")
    result = face_service.detect_and_embed(image)
    if result is None:
        raise HTTPException(status_code=400, detail="No face detected in image")
    embedding, bbox, meta = result
    spoof = anti_spoof.predict(image, bbox) if (run_spoof and anti_spoof) else None
    if spoof and not spoof.is_real:
        raise HTTPException(status_code=400, detail=f"Spoof detected (confidence={spoof.confidence:.2f}, method={spoof.method})")
    return embedding, bbox, meta, image


@app.post("/api/v1/biometric/face/enroll", dependencies=[Depends(verify_api_key)])
async def biometric_face_enroll(request: BiometricEnrollRequest, db: Session = Depends(get_db)):
    settings = get_settings()
    embedding, bbox, meta, image = await asyncio.to_thread(_decode_detect_spoof, request.image, request.antiSpoof)
    quality_report = check_quality(
        image, bbox,
        blur_threshold=settings.quality_blur_threshold,
        min_face_area_pct=settings.quality_min_face_area_pct,
        max_face_area_pct=settings.quality_max_face_area_pct,
    )
    if not quality_report.passed:
        issues = "; ".join(f"{i.code}: {i.message}" for i in quality_report.issues)
        raise HTTPException(status_code=400, detail=f"Quality check failed: {issues}")
    uid = _subject_user_id(request.institutionId, request.subjectRef)
    stored = await asyncio.to_thread(
        embedding_service.store_face_embedding,
        db, uid, request.institutionId, embedding, meta["quality"], True, request.subjectRef,
    )
    return {"success": True, "subjectRef": request.subjectRef, "embeddingId": stored["id"], "qualityScore": meta["quality"]}


@app.post("/api/v1/biometric/face/verify", dependencies=[Depends(verify_api_key)])
async def biometric_face_verify(request: BiometricVerifyRequest, db: Session = Depends(get_db)):
    start = time.time()
    settings = get_settings()
    embedding, _bbox, _meta, _image = await asyncio.to_thread(_decode_detect_spoof, request.image, request.antiSpoof)
    stored = await asyncio.to_thread(embedding_service.get_subject_embeddings, db, request.institutionId, request.subjectRef)
    if not stored:
        raise HTTPException(status_code=404, detail="Subject is not enrolled")
    best = max(float(np.dot(embedding, s)) for s in stored)
    threshold = settings.match_threshold
    matched = best >= threshold
    uid = _subject_user_id(request.institutionId, request.subjectRef)
    embedding_service.log_verification(
        db, uid, request.institutionId, "face", None,
        "match" if matched else "no_match", best, 0, int((time.time() - start) * 1000), best_match_score=best,
    )
    return {"match": matched, "confidence": round(best, 4), "threshold": threshold, "subjectRef": request.subjectRef}


@app.post("/api/v1/biometric/face/identify", dependencies=[Depends(verify_api_key)])
async def biometric_face_identify(request: BiometricIdentifyRequest, db: Session = Depends(get_db)):
    start = time.time()
    settings = get_settings()
    embedding, _bbox, _meta, _image = await asyncio.to_thread(_decode_detect_spoof, request.image, request.antiSpoof)
    matches = await asyncio.to_thread(
        embedding_service.find_matching_subjects, db, embedding, request.institutionId, settings.match_threshold, 5,
    )
    if matches:
        top = matches[0]
        embedding_service.log_verification(
            db, None, request.institutionId, "face", None, "match", top["similarity"], 0,
            int((time.time() - start) * 1000), best_match_score=top["similarity"],
        )
        return {
            "match": True,
            "subjectRef": top["subject_ref"],
            "confidence": round(top["similarity"], 4),
            "candidates": [{"subjectRef": m["subject_ref"], "confidence": round(m["similarity"], 4)} for m in matches],
        }
    embedding_service.log_verification(
        db, None, request.institutionId, "face", None, "no_match", 0, 0, int((time.time() - start) * 1000),
    )
    return {"match": False, "subjectRef": None, "confidence": 0, "candidates": []}


@app.get("/api/v1/biometric/face/status", dependencies=[Depends(verify_api_key)])
async def biometric_face_status(institutionId: str, subjectRef: str, db: Session = Depends(get_db)):
    n = await asyncio.to_thread(embedding_service.count_subject, db, institutionId, subjectRef)
    return {"subjectRef": subjectRef, "enrolled": n > 0, "samples": n}


@app.delete("/api/v1/biometric/face", dependencies=[Depends(verify_api_key)])
async def biometric_face_delete(institutionId: str, subjectRef: str, db: Session = Depends(get_db)):
    removed = await asyncio.to_thread(embedding_service.delete_subject, db, institutionId, subjectRef)
    return {"success": True, "removed": removed}


# ── Public Biometric API: contactless fingerprint (1:1 only — AKAZE/RANSAC) ──
# Subjects key by the same deterministic uuid5(institution:subjectRef), so the
# existing per-user fingerprint_service methods isolate them with no schema change.

_FP_POSITION = "api"  # one logical finger for the single-image contactless API


class BiometricFpEnrollRequest(BaseModel):
    institutionId: str
    subjectRef: str
    image: str


class BiometricFpVerifyRequest(BaseModel):
    institutionId: str
    subjectRef: str
    image: str


@app.post("/api/v1/biometric/fingerprint/enroll", dependencies=[Depends(verify_api_key)])
async def biometric_fp_enroll(request: BiometricFpEnrollRequest, db: Session = Depends(get_db)):
    settings = get_settings()
    image = await asyncio.to_thread(fingerprint_service.decode_image, request.image)
    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image data")
    quality = await asyncio.to_thread(fingerprint_service.check_quality, image, settings)
    if not quality.passed:
        raise HTTPException(status_code=400, detail=f"Fingerprint quality too low: {quality.hints}")
    enhanced = await asyncio.to_thread(fingerprint_service.make_template, image)
    uid = _subject_user_id(request.institutionId, request.subjectRef)
    stored = await asyncio.to_thread(
        fingerprint_service.store_template,
        db, uid, request.institutionId, _FP_POSITION, enhanced,
        quality.scores.get("ridge_peak_ratio", 0.0), settings.fingerprint_max_templates,
    )
    return {"success": True, "subjectRef": request.subjectRef, "templatesCount": stored["templates_count"]}


@app.post("/api/v1/biometric/fingerprint/verify", dependencies=[Depends(verify_api_key)])
async def biometric_fp_verify(request: BiometricFpVerifyRequest, db: Session = Depends(get_db)):
    start = time.time()
    settings = get_settings()
    image = await asyncio.to_thread(fingerprint_service.decode_image, request.image)
    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image data")
    quality = await asyncio.to_thread(fingerprint_service.check_quality, image, settings)
    if not quality.passed:
        raise HTTPException(status_code=400, detail=f"Fingerprint quality too low: {quality.hints}")
    enhanced = await asyncio.to_thread(fingerprint_service.make_template, image)
    uid = _subject_user_id(request.institutionId, request.subjectRef)
    result = await asyncio.to_thread(
        fingerprint_service.verify_finger,
        db, uid, enhanced, _FP_POSITION,
        settings.fingerprint_match_min_inliers, settings.fingerprint_match_min_inlier_ratio,
    )
    if result.get("templates_count", 0) == 0:
        raise HTTPException(status_code=404, detail="Subject is not enrolled")
    embedding_service.log_verification(
        db, uid, request.institutionId, "fingerprint", None,
        "match" if result["verified"] else "no_match",
        result.get("inlier_ratio", 0.0), 0, int((time.time() - start) * 1000),
    )
    return {
        "match": bool(result["verified"]),
        "inliers": result.get("inliers", 0),
        "inlierRatio": result.get("inlier_ratio", 0.0),
        "subjectRef": request.subjectRef,
    }


@app.get("/api/v1/biometric/fingerprint/status", dependencies=[Depends(verify_api_key)])
async def biometric_fp_status(institutionId: str, subjectRef: str, db: Session = Depends(get_db)):
    uid = _subject_user_id(institutionId, subjectRef)
    n = await asyncio.to_thread(fingerprint_service.templates_count, db, uid)
    return {"subjectRef": subjectRef, "enrolled": n > 0, "samples": n}


@app.delete("/api/v1/biometric/fingerprint", dependencies=[Depends(verify_api_key)])
async def biometric_fp_delete(institutionId: str, subjectRef: str, db: Session = Depends(get_db)):
    uid = _subject_user_id(institutionId, subjectRef)
    removed = await asyncio.to_thread(fingerprint_service.delete_templates, db, uid)
    return {"success": True, "removed": removed}
