import numpy as np
import cv2
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)


@dataclass
class QualityIssue:
    code: str
    message: str
    severity: str


@dataclass
class QualityReport:
    passed: bool
    issues: List[QualityIssue] = field(default_factory=list)
    scores: dict = field(default_factory=dict)


def check_quality(
    image: np.ndarray,
    bbox: np.ndarray,
    blur_threshold: float = 20.0,
    min_face_area_pct: float = 8.0,
    max_face_area_pct: float = 70.0,
    min_brightness: float = 40.0,
    max_brightness: float = 220.0,
    max_yaw: float = 25.0,
    max_pitch: float = 25.0,
    landmark_confidence: float = 0.5,
) -> QualityReport:
    issues: List[QualityIssue] = []
    scores: dict = {}

    h, w = image.shape[:2]
    img_area = h * w
    x1, y1, x2, y2 = map(float, bbox[:4])
    face_area = (x2 - x1) * (y2 - y1)
    face_pct = (face_area / img_area) * 100.0

    scores["face_area_pct"] = round(face_pct, 2)

    ix1, iy1, ix2, iy2 = max(0, int(x1)), max(0, int(y1)), min(w, int(x2)), min(h, int(y2))
    face_crop = image[iy1:iy2, ix1:ix2]

    if face_crop.size == 0:
        return QualityReport(passed=False, issues=[QualityIssue("no_face", "Face crop is empty", "fail")], scores=scores)

    gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY) if len(face_crop.shape) == 3 else face_crop

    # Blur check - Laplacian variance
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    scores["blur_score"] = round(float(laplacian_var), 2)
    if laplacian_var < blur_threshold:
        issues.append(QualityIssue("blur", f"Image too blurry (var={laplacian_var:.1f}, need>{blur_threshold})", "fail"))

    # Brightness check
    mean_brightness = float(np.mean(gray))
    scores["brightness"] = round(mean_brightness, 2)
    if mean_brightness < min_brightness:
        issues.append(QualityIssue("too_dark", f"Face too dark (brightness={mean_brightness:.1f}, need>{min_brightness})", "fail"))
    elif mean_brightness > max_brightness:
        issues.append(QualityIssue("too_bright", f"Face too bright (brightness={mean_brightness:.1f}, need<{max_brightness})", "fail"))

    # Face size check
    if face_pct < min_face_area_pct:
        issues.append(QualityIssue("face_too_small", f"Face too small ({face_pct:.1f}%, need>{min_face_area_pct}%)", "fail"))
    elif face_pct > max_face_area_pct:
        issues.append(QualityIssue("face_too_large", f"Face too close ({face_pct:.1f}%, need<{max_face_area_pct}%)", "fail"))

    # Pose check (if insightface keypoints available in bbox metadata)
    if len(bbox) >= 8:
        try:
            kps = np.array(bbox[4:8]).reshape(-1, 2) if len(bbox) >= 8 else None
            if kps is not None and kps.shape[0] >= 2:
                left_eye, right_eye = kps[0], kps[1]
                eye_dx = right_eye[0] - left_eye[0]
                eye_dy = right_eye[1] - left_eye[1]
                yaw_estimate = abs(np.degrees(np.arctan2(eye_dy, eye_dx + 1e-8)))
                scores["yaw_estimate"] = round(float(yaw_estimate), 2)
                if yaw_estimate > max_yaw:
                    issues.append(QualityIssue("pose_yaw", f"Face turned too much (yaw~{yaw_estimate:.1f}°, max {max_yaw}°)", "warn"))
        except Exception:
            pass

    # Landmark confidence check (if extended bbox data available)
    if hasattr(bbox, 'det_score') or (isinstance(bbox, np.ndarray) and bbox.shape[0] > 5):
        try:
            det_score = float(bbox[4]) if isinstance(bbox, np.ndarray) and len(bbox) > 4 else None
            if det_score is not None and det_score < landmark_confidence:
                issues.append(QualityIssue("low_confidence", f"Face detection confidence low ({det_score:.2f})", "warn"))
                scores["det_confidence"] = round(det_score, 3)
        except Exception:
            pass

    has_fail = any(i.severity == "fail" for i in issues)
    return QualityReport(passed=not has_fail, issues=issues, scores=scores)
