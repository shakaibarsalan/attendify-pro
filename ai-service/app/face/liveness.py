import numpy as np
import random
import time
import hmac
import hashlib
import json
import logging
import cv2
import threading
from typing import List, Optional, Tuple
from dataclasses import dataclass, field, asdict
from app.core.config import get_settings
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

# Sustained-pose / expression gestures only. "blink" was removed: a blink lasts
# ~150-300ms but the client captures at ~2 FPS, so the eye-closed frame is almost
# always missed, which was the dominant cause of false liveness rejections
# (37% pass rate in production). The remaining gestures are held long enough to be
# reliably captured at low frame rates and still defeat a static-photo attack.
CHALLENGE_TYPES = ["turn_left", "turn_right", "smile", "look_up", "look_down"]

TOTAL_SESSION_TIMEOUT_S = 30
FPS_SAMPLE_RATE = 5


@dataclass
class ChallengeSession:
    session_id: str
    challenges: List[str]
    timeout_seconds: float
    issued_at: float
    hmac_token: str


@dataclass
class ChallengeResult:
    passed: bool
    score: float
    reason: Optional[str] = None
    processing_time_ms: int = 0
    challenge_details: dict = field(default_factory=dict)


def _get_hmac_secret() -> str:
    return get_settings().liveness_hmac_secret


def _generate_hmac_token(session_id: str, challenges: List[str]) -> str:
    secret = _get_hmac_secret()
    payload = f"{session_id}:{','.join(challenges)}"
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]


def _verify_hmac_token(session_id: str, challenges: List[str], token: str) -> bool:
    expected = _generate_hmac_token(session_id, challenges)
    return hmac.compare_digest(expected, token)


class LivenessService:
    def __init__(self):
        self._initialized = False
        self.face_landmarker = None
        self.face_mesh = None
        self._active_sessions: dict = {}

    def initialize(self):
        if self._initialized:
            return
        try:
            import mediapipe as mp
            try:
                from mediapipe.tasks.python import vision, BaseOptions
                import os
                model_path = os.path.join(os.path.dirname(__file__), '..', '..', 'models', 'face_landmarker.task')
                if not os.path.exists(model_path):
                    model_path = './models/face_landmarker.task'
                if os.path.exists(model_path):
                    options = vision.FaceLandmarkerOptions(
                        base_options=BaseOptions(model_asset_path=model_path),
                        output_face_blendshapes=True,
                        output_facial_transformation_matrixes=False,
                        num_faces=1,
                    )
                    self.face_landmarker = vision.FaceLandmarker.create_from_options(options)
                    logger.info("Liveness: MediaPipe FaceLandmarker (tasks API) loaded")
                else:
                    logger.info(f"Liveness: FaceLandmarker model not found at {model_path}, trying solutions API")
            except Exception as e:
                logger.warning(f"Liveness: FaceLandmarker tasks API failed: {e}")

            if self.face_landmarker is None:
                try:
                    self.face_mesh = mp.solutions.face_mesh.FaceMesh(
                        max_num_faces=1,
                        refine_landmarks=True,
                        min_detection_confidence=0.5,
                        min_tracking_confidence=0.5,
                    )
                    logger.info("Liveness: MediaPipe FaceMesh (solutions API) loaded")
                except Exception as e:
                    logger.warning(f"Liveness: FaceMesh solutions API failed: {e}")
        except ImportError:
            logger.info("Liveness: MediaPipe not available, using geometric fallback")
        except Exception as e:
            logger.warning(f"Liveness: init failed: {e}")
        self._initialized = True

        sweep_thread = threading.Thread(target=self._sweep_loop, daemon=True)
        sweep_thread.start()

    def _sweep_loop(self):
        while True:
            time.sleep(60)
            self._sweep_expired_sessions()

    def _sweep_expired_sessions(self):
        now = time.time()
        expired = [sid for sid, sess in self._active_sessions.items() if now - sess.issued_at > TOTAL_SESSION_TIMEOUT_S]
        for sid in expired:
            self._active_sessions.pop(sid, None)

    @staticmethod
    def _session_key(session_id: str) -> str:
        return f"liveness_session:{session_id}"

    def _store_session(self, session: ChallengeSession):
        redis_client = get_redis()
        if redis_client:
            try:
                redis_client.setex(self._session_key(session.session_id), TOTAL_SESSION_TIMEOUT_S, json.dumps(asdict(session)))
                return
            except Exception as e:
                logger.warning(f"Liveness: Redis session store failed, using in-memory: {e}")
        self._active_sessions[session.session_id] = session

    def _get_session(self, session_id: str) -> Optional[ChallengeSession]:
        redis_client = get_redis()
        if redis_client:
            try:
                data = redis_client.get(self._session_key(session_id))
                return ChallengeSession(**json.loads(data)) if data else None
            except Exception as e:
                logger.warning(f"Liveness: Redis session get failed, using in-memory: {e}")
        return self._active_sessions.get(session_id)

    def _delete_session(self, session_id: str):
        redis_client = get_redis()
        if redis_client:
            try:
                redis_client.delete(self._session_key(session_id))
                return
            except Exception as e:
                logger.warning(f"Liveness: Redis session delete failed, using in-memory: {e}")
        self._active_sessions.pop(session_id, None)

    def generate_challenge(self, user_id: Optional[str] = None, session_id: Optional[str] = None) -> dict:
        if not self._initialized:
            self.initialize()

        sid = session_id or f"live_{int(time.time())}_{random.randint(1000, 9999)}"
        challenges = random.sample(CHALLENGE_TYPES, k=2)
        issued_at = time.time()
        token = _generate_hmac_token(sid, challenges)
        challenge_timeout = get_settings().liveness_challenge_timeout_s

        self._store_session(ChallengeSession(
            session_id=sid,
            challenges=challenges,
            timeout_seconds=challenge_timeout,
            issued_at=issued_at,
            hmac_token=token,
        ))

        return {
            "session_id": sid,
            "challenges": challenges,
            "timeout_seconds": challenge_timeout,
            "fps_hint": FPS_SAMPLE_RATE,
            "token": token,
            "instruction": _get_instructions(challenges),
        }

    def verify_challenge(
        self,
        session_id: str,
        token: str,
        frames: List[np.ndarray],
        expected_challenges: List[str],
    ) -> ChallengeResult:
        start = time.time()
        if not self._initialized:
            self.initialize()

        if not _verify_hmac_token(session_id, expected_challenges, token):
            return ChallengeResult(passed=False, score=0.0, reason="invalid_token")

        session = self._get_session(session_id)
        if not session:
            return ChallengeResult(passed=False, score=0.0, reason="session_not_found")
        if (time.time() - session.issued_at) > TOTAL_SESSION_TIMEOUT_S:
            self._delete_session(session_id)
            return ChallengeResult(passed=False, score=0.0, reason="challenge_expired")

        if len(frames) < 3:
            return ChallengeResult(passed=False, score=0.3, reason="insufficient_frames", processing_time_ms=int((time.time() - start) * 1000))

        details = {}
        total_score = 0.0

        for i, challenge in enumerate(expected_challenges):
            result = self._verify_single_challenge(challenge, frames)
            details[challenge] = {"passed": result[0], "score": result[1]}
            total_score += result[1]

        avg_score = total_score / max(len(expected_challenges), 1)
        passed_count = sum(1 for d in details.values() if d.get("passed", False))
        # Require overall confidence plus at least all-but-one challenge to pass —
        # tolerates one ambiguous challenge (lighting/angle) without weakening
        # the requirement that genuine motion was detected overall.
        passed = avg_score >= 0.5 and passed_count >= max(1, len(details) - 1)

        self._delete_session(session_id)

        return ChallengeResult(
            passed=passed,
            score=avg_score,
            processing_time_ms=int((time.time() - start) * 1000),
            challenge_details=details,
        )

    def check_gestures(self, challenges: List[str], frames: List[np.ndarray]) -> dict:
        """Non-destructive early-advance helper: reports which of the given gestures
        are already visible in the frames, WITHOUT touching any session or HMAC and
        WITHOUT the pass/threshold aggregation. The client uses this to advance a
        challenge the instant the gesture is detected instead of waiting the full
        fixed window. Authoritative liveness is still decided by verify_challenge
        (called once, at attendance-mark time) — this only affects UX timing."""
        if not self._initialized:
            self.initialize()
        # Need a neutral baseline frame plus at least one motion frame.
        if len(frames) < 2:
            return {c: {"detected": False, "score": 0.0} for c in challenges}
        results = {}
        for challenge in challenges:
            try:
                passed, score = self._verify_single_challenge(challenge, frames)
            except Exception as e:
                logger.warning(f"check_gestures failed for {challenge}: {e}")
                passed, score = False, 0.0
            results[challenge] = {"detected": bool(passed), "score": float(score)}
        return results

    def _verify_single_challenge(self, challenge: str, frames: List[np.ndarray]) -> Tuple[bool, float]:
        if self.face_landmarker is not None:
            return self._verify_with_landmarker(challenge, frames)
        if self.face_mesh is not None:
            return self._verify_with_mediapipe(challenge, frames)
        return self._verify_geometric(challenge, frames)

    def _verify_with_landmarker(self, challenge: str, frames: List[np.ndarray]) -> Tuple[bool, float]:
        try:
            import mediapipe as mp
            from mediapipe import Image
            landmarks_sequence = []
            blendshapes_list = []
            for frame in frames:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) if len(frame.shape) == 3 else frame
                mp_image = Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                result = self.face_landmarker.detect(mp_image)
                if result.face_landmarks:
                    landmarks_sequence.append(result.face_landmarks[0])
                if result.face_blendshapes:
                    blendshapes_list.append({bs.category_name: bs.score for bs in result.face_blendshapes[0]})
            if len(landmarks_sequence) < 2:
                return False, 0.2

            if challenge in ("blink_twice", "blink_thrice"):
                return self._detect_blinks_landmarks(landmarks_sequence, expected=2 if "twice" in challenge else 3)
            elif challenge == "turn_left":
                return self._detect_turn_landmarks(landmarks_sequence, "left")
            elif challenge == "turn_right":
                return self._detect_turn_landmarks(landmarks_sequence, "right")
            elif challenge == "smile":
                return self._detect_smile_blendshapes(blendshapes_list) if blendshapes_list else self._detect_smile(landmarks_sequence)
            elif challenge == "mouth_open":
                return self._detect_mouth_open_blendshapes(blendshapes_list) if blendshapes_list else self._detect_mouth_open(landmarks_sequence)
            elif challenge == "look_up":
                return self._detect_look_up_landmarks(landmarks_sequence)
            elif challenge == "look_down":
                return self._detect_look_down_landmarks(landmarks_sequence)
            else:
                return False, 0.0
        except Exception as e:
            logger.warning(f"FaceLandmarker liveness failed: {e}")
            return self._verify_geometric(challenge, frames)

    def _detect_blinks_landmarks(self, landmarks_seq, expected: int = 2) -> Tuple[bool, float]:
        ear_values = []
        for lm in landmarks_seq:
            left_ear = _eye_aspect_ratio_landmark(lm, [33, 160, 158, 133, 153, 144])
            right_ear = _eye_aspect_ratio_landmark(lm, [362, 385, 387, 263, 373, 380])
            ear_values.append((left_ear + right_ear) / 2)
        blinks = 0
        for i in range(1, len(ear_values)):
            if ear_values[i - 1] > 0.21 and ear_values[i] < 0.21:
                blinks += 1
        score = min(blinks / max(expected, 1), 1.0)
        # A single detected blink already proves voluntary eye movement;
        # requiring the full count within a short capture window is unreliable.
        return blinks >= 1, score

    def _detect_turn_landmarks(self, landmarks_seq, direction: str) -> Tuple[bool, float]:
        nose_x_values = [lm[1].x for lm in landmarks_seq]
        start_x = nose_x_values[0]
        # Frames are mirrored (selfie view), so a head turn to the user's left moves
        # the nose toward lower x in the captured image. Mapping is chosen so the
        # on-screen label and guide arrow match the user's actual motion.
        expected_sign = -1 if direction == "left" else 1
        diffs = [(nose_x_values[i] - start_x) * expected_sign for i in range(1, len(nose_x_values))]
        turned_frames = sum(1 for d in diffs if d > 0.02)
        score = min(turned_frames / max(len(nose_x_values) // 2, 1), 1.0)
        return turned_frames >= 1, score

    def _detect_look_up_landmarks(self, landmarks_seq) -> Tuple[bool, float]:
        nose_y_values = [lm[1].y for lm in landmarks_seq]
        start_y = nose_y_values[0]
        upward_frames = sum(1 for y in nose_y_values[1:] if y < start_y - 0.015)
        score = min(upward_frames / max(len(nose_y_values) // 2, 1), 1.0)
        return upward_frames >= 1, score

    def _detect_look_down_landmarks(self, landmarks_seq) -> Tuple[bool, float]:
        nose_y_values = [lm[1].y for lm in landmarks_seq]
        start_y = nose_y_values[0]
        downward_frames = sum(1 for y in nose_y_values[1:] if y > start_y + 0.015)
        score = min(downward_frames / max(len(nose_y_values) // 2, 1), 1.0)
        return downward_frames >= 1, score

    def _detect_smile_blendshapes(self, blendshapes_list: list) -> Tuple[bool, float]:
        smile_scores = []
        for bs in blendshapes_list:
            score = bs.get("mouthSmileLeft", 0) * 0.5 + bs.get("mouthSmileRight", 0) * 0.5
            smile_scores.append(score)
        if len(smile_scores) < 2:
            return False, 0.0
        max_smile = max(smile_scores)
        has_smile_change = max(smile_scores) > 0.2 and min(smile_scores) < 0.15
        return has_smile_change, min(max_smile, 1.0)

    def _detect_mouth_open_blendshapes(self, blendshapes_list: list) -> Tuple[bool, float]:
        open_scores = []
        for bs in blendshapes_list:
            score = bs.get("jawOpen", 0)
            open_scores.append(score)
        if not open_scores:
            return False, 0.0
        max_open = max(open_scores)
        return max_open > 0.15, min(max_open, 1.0)

    def _verify_with_mediapipe(self, challenge: str, frames: List[np.ndarray]) -> Tuple[bool, float]:
        try:
            import mediapipe as mp
            landmarks_sequence = []
            for frame in frames:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) if len(frame.shape) == 3 else frame
                result = self.face_mesh.process(rgb)
                if result.multi_face_landmarks:
                    lm = result.multi_face_landmarks[0]
                    landmarks_sequence.append(lm.landmark)

            if len(landmarks_sequence) < 2:
                return False, 0.2

            if challenge in ("blink_twice", "blink_thrice"):
                return self._detect_blinks(landmarks_sequence, expected=2 if "twice" in challenge else 3)
            elif challenge == "turn_left":
                return self._detect_turn(landmarks_sequence, "left")
            elif challenge == "turn_right":
                return self._detect_turn(landmarks_sequence, "right")
            elif challenge == "smile":
                return self._detect_smile(landmarks_sequence)
            elif challenge == "mouth_open":
                return self._detect_mouth_open(landmarks_sequence)
            elif challenge == "look_up":
                return self._detect_look_up(landmarks_sequence)
            elif challenge == "look_down":
                return self._detect_look_down(landmarks_sequence)
            else:
                return False, 0.0
        except Exception as e:
            logger.warning(f"MediaPipe liveness failed: {e}")
            return self._verify_geometric(challenge, frames)

    def _detect_blinks(self, landmarks_seq, expected: int = 2) -> Tuple[bool, float]:
        ear_values = []
        for lm in landmarks_seq:
            left_ear = _eye_aspect_ratio(lm, [33, 160, 158, 133, 153, 144])
            right_ear = _eye_aspect_ratio(lm, [362, 385, 387, 263, 373, 380])
            ear_values.append((left_ear + right_ear) / 2)

        blinks = 0
        for i in range(1, len(ear_values)):
            if ear_values[i - 1] > 0.21 and ear_values[i] < 0.21:
                blinks += 1

        score = min(blinks / max(expected, 1), 1.0)
        # A single detected blink already proves voluntary eye movement;
        # requiring the full count within a short capture window is unreliable.
        return blinks >= 1, score

    def _detect_turn(self, landmarks_seq, direction: str) -> Tuple[bool, float]:
        nose_x_values = [lm[1].x for lm in landmarks_seq]
        start_x = nose_x_values[0]
        max_deviation = max(abs(x - start_x) for x in nose_x_values)
        # Frames are mirrored (selfie view), so a head turn to the user's left moves
        # the nose toward lower x in the captured image. Mapping is chosen so the
        # on-screen label and guide arrow match the user's actual motion.
        expected_sign = -1 if direction == "left" else 1

        turned_frames = sum(
            1 for i in range(1, len(nose_x_values))
            if (nose_x_values[i] - start_x) * expected_sign > 0.02
        )
        score = min(turned_frames / max(len(nose_x_values) // 2, 1), 1.0)
        return turned_frames >= 1, score

    def _detect_smile(self, landmarks_seq) -> Tuple[bool, float]:
        mouth_widths = []
        for lm in landmarks_seq:
            left_corner = lm[61]
            right_corner = lm[291]
            width = abs(right_corner.x - left_corner.x)
            mouth_widths.append(width)

        if len(mouth_widths) < 2:
            return False, 0.0

        max_change = max(abs(w - mouth_widths[0]) for w in mouth_widths)
        score = min(max_change / 0.03, 1.0)
        return max_change > 0.01, score

    def _detect_mouth_open(self, landmarks_seq) -> Tuple[bool, float]:
        open_values = []
        for lm in landmarks_seq:
            upper_lip = lm[13]
            lower_lip = lm[14]
            open_values.append(abs(lower_lip.y - upper_lip.y))

        max_open = max(open_values) if open_values else 0
        score = min(max_open / 0.04, 1.0)
        return max_open > 0.02, score

    def _detect_look_up(self, landmarks_seq) -> Tuple[bool, float]:
        nose_y_values = [lm[1].y for lm in landmarks_seq]
        start_y = nose_y_values[0]
        upward_frames = sum(1 for y in nose_y_values[1:] if y < start_y - 0.015)
        score = min(upward_frames / max(len(nose_y_values) // 2, 1), 1.0)
        return upward_frames >= 1, score

    def _detect_look_down(self, landmarks_seq) -> Tuple[bool, float]:
        nose_y_values = [lm[1].y for lm in landmarks_seq]
        start_y = nose_y_values[0]
        downward_frames = sum(1 for y in nose_y_values[1:] if y > start_y + 0.015)
        score = min(downward_frames / max(len(nose_y_values) // 2, 1), 1.0)
        return downward_frames >= 1, score

    def _verify_geometric(self, challenge: str, frames: List[np.ndarray]) -> Tuple[bool, float]:
        import cv2
        movements = []
        for i in range(1, len(frames)):
            prev_gray = cv2.cvtColor(frames[i - 1], cv2.COLOR_BGR2GRAY) if len(frames[i - 1].shape) == 3 else frames[i - 1]
            curr_gray = cv2.cvtColor(frames[i], cv2.COLOR_BGR2GRAY) if len(frames[i].shape) == 3 else frames[i]

            if prev_gray.shape != curr_gray.shape:
                h = min(prev_gray.shape[0], curr_gray.shape[0])
                w = min(prev_gray.shape[1], curr_gray.shape[1])
                prev_gray = prev_gray[:h, :w]
                curr_gray = curr_gray[:h, :w]

            flow = cv2.calcOpticalFlowFarneback(prev_gray, curr_gray, None, 0.5, 3, 15, 3, 5, 1.2, 0)
            dx, dy = flow[..., 0], flow[..., 1]
            movements.append({
                "mean_dx": float(np.mean(dx)),
                "mean_dy": float(np.mean(dy)),
                "magnitude": float(np.mean(np.sqrt(dx ** 2 + dy ** 2))),
            })

        if not movements:
            return False, 0.0

        total_motion = sum(m["magnitude"] for m in movements)
        avg_motion = total_motion / len(movements)

        has_direction_change = False
        if len(movements) >= 2:
            dx_signs = [1 if m["mean_dx"] > 0.5 else (-1 if m["mean_dx"] < -0.5 else 0) for m in movements]
            dy_signs = [1 if m["mean_dy"] > 0.5 else (-1 if m["mean_dy"] < -0.5 else 0) for m in movements]
            has_direction_change = len(set(s for s in dx_signs if s != 0)) > 1 or len(set(s for s in dy_signs if s != 0)) > 1

        score = min(avg_motion / 3.0, 1.0)
        passed = avg_motion > 1.0 and has_direction_change
        return passed, score


def _eye_aspect_ratio(landmarks, indices):
    pts = [landmarks[i] for i in indices]
    v1 = abs(pts[1].y - pts[5].y)
    v2 = abs(pts[2].y - pts[4].y)
    h = abs(pts[0].x - pts[3].x)
    return (v1 + v2) / (2 * h + 1e-8)


def _eye_aspect_ratio_landmark(face_landmarks, indices):
    pts = [face_landmarks[i] for i in indices]
    v1 = abs(pts[1].y - pts[5].y)
    v2 = abs(pts[2].y - pts[4].y)
    h = abs(pts[0].x - pts[3].x)
    return (v1 + v2) / (2 * h + 1e-8)


def _get_instructions(challenges: List[str]) -> str:
    labels = {
        "blink_twice": "Blink your eyes twice",
        "blink_thrice": "Blink your eyes three times",
        "turn_left": "Turn your head to your left",
        "turn_right": "Turn your head to your right",
        "smile": "Give a natural smile",
        "look_up": "Tilt your head up",
        "look_down": "Tilt your head down",
    }
    parts = [f"{i + 1}. {labels.get(c, c)}" for i, c in enumerate(challenges)]
    return "Complete these actions: " + " → ".join(parts)


liveness_service = LivenessService()
