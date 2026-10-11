import numpy as np
import cv2
import os
import logging
import time
from typing import Optional, Tuple, List
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class AntiSpoofResult:
    is_real: bool
    confidence: float
    method: str
    raw_scores: dict = field(default_factory=dict)


def _crop_face(image: np.ndarray, bbox: np.ndarray, scale: float = 2.5) -> np.ndarray:
    x1, y1, x2, y2 = map(int, bbox[:4])
    h, w = image.shape[:2]
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    fw, fh = (x2 - x1) * scale, (y2 - y1) * scale
    nx1 = max(0, int(cx - fw / 2))
    ny1 = max(0, int(cy - fh / 2))
    nx2 = min(w, int(cx + fw / 2))
    ny2 = min(h, int(cy + fh / 2))
    return image[ny1:ny2, nx1:nx2]


class TextureAnalyzer:
    def analyze(self, image: np.ndarray, face_bbox: np.ndarray) -> dict:
        face_crop = _crop_face(image, face_bbox, scale=2.0)
        if face_crop.size == 0:
            return {"score": 0.0, "high_freq_ratio": 0, "lbp_entropy": 0, "luminance_std": 0, "saturation_std": 0}

        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY) if len(face_crop.shape) == 3 else face_crop
        gray = cv2.resize(gray, (80, 80))

        h, w = gray.shape
        fft = np.fft.fft2(gray)
        fft_shift = np.fft.fftshift(fft)
        magnitude = np.log1p(np.abs(fft_shift))
        mag_norm = magnitude / (magnitude.max() + 1e-8)

        cy, cx = h // 2, w // 2
        low_mask = np.zeros((h, w), dtype=bool)
        low_mask[cy - 5:cy + 5, cx - 5:cx + 5] = True
        high_energy = np.sum(mag_norm[~low_mask])
        total_energy = np.sum(mag_norm) + 1e-8
        high_freq_ratio = high_energy / total_energy

        lbp = self._compute_lbp(gray)
        lbp_hist = self._histogram(lbp, 256)
        lbp_hist = lbp_hist / (lbp_hist.sum() + 1e-8)
        entropy = -np.sum(lbp_hist * np.log2(lbp_hist + 1e-8))

        lab = cv2.cvtColor(face_crop, cv2.COLOR_BGR2LAB)
        l_std = float(np.std(lab[:, :, 0]))

        hsv = cv2.cvtColor(face_crop, cv2.COLOR_BGR2HSV)
        sat_std = float(np.std(hsv[:, :, 1]))

        score = 0.0
        score += min(high_freq_ratio * 8.0, 0.25)
        score += min(entropy / 7.0, 0.25)
        score += min(l_std / 80.0, 0.25)
        score += min(sat_std / 60.0, 0.25)
        score = min(score, 1.0)

        return {
            "score": round(score, 4),
            "high_freq_ratio": round(float(high_freq_ratio), 4),
            "lbp_entropy": round(float(entropy), 4),
            "luminance_std": round(float(l_std), 2),
            "saturation_std": round(float(sat_std), 2),
        }

    def _compute_lbp(self, image: np.ndarray) -> np.ndarray:
        c = image[1:-1, 1:-1]
        lbp = (
            ((image[0:-2, 1:-1] >= c).astype(np.uint8) << 7) |
            ((image[0:-2, 2:  ] >= c).astype(np.uint8) << 6) |
            ((image[1:-1, 2:  ] >= c).astype(np.uint8) << 5) |
            ((image[2:,   2:  ] >= c).astype(np.uint8) << 4) |
            ((image[2:,   1:-1] >= c).astype(np.uint8) << 3) |
            ((image[2:,   0:-2] >= c).astype(np.uint8) << 2) |
            ((image[1:-1, 0:-2] >= c).astype(np.uint8) << 1) |
            ((image[0:-2, 0:-2] >= c).astype(np.uint8) << 0)
        )
        h, w = image.shape
        result = np.zeros((h, w), dtype=np.uint8)
        result[1:-1, 1:-1] = lbp
        return result

    def _histogram(self, arr: np.ndarray, bins: int) -> np.ndarray:
        return np.bincount(arr.flatten().astype(np.int32), minlength=bins)[:bins].astype(np.float32)


class DepthAnalyzer:
    def __init__(self):
        self._landmarker = None

    def _get_landmarker(self):
        if self._landmarker is not None:
            return self._landmarker
        try:
            from mediapipe.tasks.python import vision, BaseOptions
            import mediapipe as mp
            model_path = "./models/face_landmarker.task"
            if not os.path.exists(model_path):
                return None
            options = vision.FaceLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=model_path),
                output_face_blendshapes=True,
                output_facial_transformation_matrixes=False,
                num_faces=1,
            )
            self._landmarker = vision.FaceLandmarker.create_from_options(options)
            return self._landmarker
        except Exception as e:
            logger.warning(f"DepthAnalyzer: FaceLandmarker not available: {e}")
            return None

    def analyze(self, image: np.ndarray) -> dict:
        landmarker = self._get_landmarker()
        if landmarker is None:
            return {"score": 0.5, "available": False}

        try:
            import mediapipe as mp
            rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB) if len(image.shape) == 3 else image
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = landmarker.detect(mp_image)

            if not result.face_landmarks:
                return {"score": 0.3, "available": True, "face_found": False}

            lm = result.face_landmarks[0]

            nose_depth = lm[4].z if len(lm) > 4 else 0
            left_cheek = lm[234].z if len(lm) > 234 else 0
            right_cheek = lm[454].z if len(lm) > 454 else 0
            forehead = lm[10].z if len(lm) > 10 else 0
            chin = lm[152].z if len(lm) > 152 else 0

            center_depth = nose_depth
            edge_depths = [abs(left_cheek), abs(right_cheek), abs(forehead), abs(chin)]
            avg_edge = np.mean(edge_depths) if edge_depths else 0

            depth_variance = abs(center_depth - avg_edge)

            left_eye_top = lm[159].y if len(lm) > 159 else 0
            left_eye_bot = lm[145].y if len(lm) > 145 else 0
            right_eye_top = lm[386].y if len(lm) > 386 else 0
            right_eye_bot = lm[374].y if len(lm) > 374 else 0
            ear_left = abs(left_eye_bot - left_eye_top) / (abs(lm[33].x - lm[133].x) + 1e-8) if len(lm) > 159 else 0.3
            ear_right = abs(right_eye_bot - right_eye_top) / (abs(lm[362].x - lm[263].x) + 1e-8) if len(lm) > 386 else 0.3

            mouth_open = abs(lm[13].y - lm[14].y) if len(lm) > 14 else 0
            face_height = abs(lm[10].y - lm[152].y) if len(lm) > 152 else 1
            mouth_ratio = mouth_open / (face_height + 1e-8)

            nose_tip = lm[1]
            nose_bridge = lm[6] if len(lm) > 6 else lm[1]
            nose_protrusion = abs(nose_tip.z - nose_bridge.z)

            score = 0.0
            if depth_variance > 0.005:
                score += 0.25
            elif depth_variance > 0.002:
                score += 0.15

            if nose_protrusion > 0.003:
                score += 0.25
            elif nose_protrusion > 0.001:
                score += 0.15

            if ear_left > 0.15 or ear_right > 0.15:
                score += 0.2
            if mouth_ratio < 0.15:
                score += 0.15

            score += 0.15

            score = min(score, 1.0)

            return {
                "score": round(score, 4),
                "available": True,
                "face_found": True,
                "depth_variance": round(float(depth_variance), 6),
                "nose_protrusion": round(float(nose_protrusion), 6),
                "ear_left": round(float(ear_left), 4),
                "ear_right": round(float(ear_right), 4),
                "mouth_ratio": round(float(mouth_ratio), 4),
            }
        except Exception as e:
            logger.warning(f"DepthAnalyzer error: {e}")
            return {"score": 0.5, "available": True, "error": str(e)}


class MotionAnalyzer:
    def analyze(self, prev_image: Optional[np.ndarray], curr_image: np.ndarray, face_bbox: np.ndarray) -> dict:
        if prev_image is None:
            return {"score": 0.5, "available": False}

        try:
            x1, y1, x2, y2 = map(int, face_bbox[:4])
            h, w = curr_image.shape[:2]
            margin = int(max(x2 - x1, y2 - y1) * 0.5)
            x1, y1 = max(0, x1 - margin), max(0, y1 - margin)
            x2, y2 = min(w, x2 + margin), min(h, y2 + margin)

            prev_face = prev_image[y1:y2, x1:x2]
            curr_face = curr_image[y1:y2, x1:x2]

            if prev_face.size == 0 or curr_face.size == 0:
                return {"score": 0.5, "available": False}

            if prev_face.shape != curr_face.shape:
                ph, pw = min(prev_face.shape[0], curr_face.shape[0]), min(prev_face.shape[1], curr_face.shape[1])
                prev_face = prev_face[:ph, :pw]
                curr_face = curr_face[:ph, :pw]

            prev_gray = cv2.cvtColor(prev_face, cv2.COLOR_BGR2GRAY)
            curr_gray = cv2.cvtColor(curr_face, cv2.COLOR_BGR2GRAY)

            flow = cv2.calcOpticalFlowFarneback(prev_gray, curr_gray, None, 0.5, 3, 15, 3, 5, 1.2, 0)
            magnitude = np.sqrt(flow[..., 0] ** 2 + flow[..., 1] ** 2)

            avg_motion = float(np.mean(magnitude))
            max_motion = float(np.max(magnitude))

            hist, _ = np.histogram(magnitude.flatten(), bins=10, range=(0, 5))
            hist_norm = hist / (hist.sum() + 1e-8)
            motion_entropy = -np.sum(hist_norm * np.log2(hist_norm + 1e-8))

            score = 0.0
            if avg_motion > 0.3 and avg_motion < 5.0:
                score += 0.4
            elif avg_motion > 0.1:
                score += 0.2

            if motion_entropy > 1.0:
                score += 0.3
            elif motion_entropy > 0.5:
                score += 0.15

            if max_motion > 1.0 and max_motion < 15.0:
                score += 0.3
            elif max_motion > 0.5:
                score += 0.15

            score = min(score, 1.0)

            return {
                "score": round(score, 4),
                "available": True,
                "avg_motion": round(avg_motion, 4),
                "max_motion": round(max_motion, 4),
                "motion_entropy": round(motion_entropy, 4),
            }
        except Exception as e:
            logger.warning(f"MotionAnalyzer error: {e}")
            return {"score": 0.5, "available": False, "error": str(e)}


class AntiSpoofDetector:
    def __init__(self, model_dir: str, threshold: float = 0.5):
        self.threshold = threshold
        self.texture = TextureAnalyzer()
        self.depth = DepthAnalyzer()
        self.motion = MotionAnalyzer()
        self._initialized = False

    def initialize(self):
        if self._initialized:
            return
        self.depth._get_landmarker()
        logger.info(f"Anti-spoof: depth_analyzer={'loaded' if self.depth._landmarker else 'unavailable'}, texture=loaded, motion=loaded")
        self._initialized = True

    def predict(self, image: np.ndarray, face_bbox: np.ndarray, prev_image: Optional[np.ndarray] = None) -> AntiSpoofResult:
        if not self._initialized:
            self.initialize()

        tex = self.texture.analyze(image, face_bbox)
        dep = self.depth.analyze(image)
        mot = self.motion.analyze(prev_image, image, face_bbox)

        w_tex = 0.25
        w_dep = 0.50
        w_mot = 0.25

        if not dep.get("available", False):
            w_tex = 0.4
            w_dep = 0.0
            w_mot = 0.6
        elif not mot.get("available", False):
            w_tex = 0.4
            w_dep = 0.6
            w_mot = 0.0

        total_w = w_tex + w_dep + w_mot
        if total_w > 0:
            w_tex /= total_w
            w_dep /= total_w
            w_mot /= total_w

        combined = w_tex * tex["score"] + w_dep * dep["score"] + w_mot * mot["score"]

        is_real = combined >= self.threshold

        return AntiSpoofResult(
            is_real=is_real,
            confidence=round(combined, 4),
            method="multi_signal",
            raw_scores={
                "texture": tex,
                "depth": dep,
                "motion": mot,
                "weights": {"texture": round(w_tex, 2), "depth": round(w_dep, 2), "motion": round(w_mot, 2)},
            },
        )

    @property
    def method_name(self) -> str:
        return "multi_signal"


anti_spoof_detector: Optional[AntiSpoofDetector] = None


def get_anti_spoof_detector() -> AntiSpoofDetector:
    global anti_spoof_detector
    if anti_spoof_detector is None:
        from app.core.config import get_settings
        settings = get_settings()
        anti_spoof_detector = AntiSpoofDetector(
            model_dir=settings.anti_spoof_model_dir,
            threshold=settings.anti_spoof_threshold,
        )
        anti_spoof_detector.initialize()
    return anti_spoof_detector


def is_spoofed(image: np.ndarray, face_bbox: np.ndarray) -> AntiSpoofResult:
    return get_anti_spoof_detector().predict(image, face_bbox)
