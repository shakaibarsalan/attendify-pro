from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
import os

class Settings(BaseSettings):
    biometric_db_host: str = "localhost"
    biometric_db_port: int = 5432
    biometric_db_name: str = "attendify_biometric"
    biometric_db_user: str = "biometric_user"
    biometric_db_password: str = ""
    ai_service_api_key: str = ""

    model_dir: str = "./models"
    face_model_name: str = "arcface"
    embedding_dim: int = 512
    # Raised 0.50 -> 0.55: production data shows every genuine multi-frame match
    # scored >= 0.736, so this tightens against lookalike / 1:N false-accepts with
    # ample headroom before any real user is rejected. The top-1/top-2 margin guard
    # in verify-multi is the primary discriminator for near-ties.
    match_threshold: float = 0.55
    recognition_threshold: float = 0.55
    # Minimum cosine gap required between the best match and the next-best (different)
    # user in the 1:N search; below this the result is treated as an ambiguous match.
    recognition_margin: float = 0.05
    liveness_threshold: float = 0.7

    anti_spoof_threshold: float = 0.7
    anti_spoof_model_dir: str = "./models/anti_spoof"

    multi_frame_min_frames: int = 3
    multi_frame_max_frames: int = 5
    # Relaxed 0.40 -> 0.30: sustained-pose liveness gestures (head turn, look up)
    # legitimately change a genuine user's per-frame embedding, which was tripping
    # the inconsistency guard. 0.30 still sits well above the ~0.1-0.3 similarity of
    # two genuinely different faces under buffalo_l, so injected-face attacks are
    # still rejected.
    embedding_consistency_threshold: float = 0.30
    static_diff_threshold: float = 1.0
    static_frame_ratio: float = 0.5

    liveness_challenge_timeout_s: int = 9

    # Contactless fingerprint (camera-based, 1:1 verification).
    # Match thresholds calibrated on synthetic ridge fields (AKAZE + similarity
    # RANSAC): genuine pairs scored >=43 inliers / >=0.048 ratio, impostors
    # <=18 / <=0.021 — thresholds sit in the gap with margin on both sides.
    # Thresholds loosened for REAL phone captures (the originals were calibrated
    # on synthetic ridge fields and were too strict — genuine fingers scored 0/4).
    # All env-overridable; tighten once real-capture separation is measured.
    fingerprint_blur_min: float = 25.0          # Laplacian variance gate on the fingertip crop
    fingerprint_ridge_peak_min: float = 1.35    # FFT ridge-band peak ratio gate (ridges visible?)
    fingerprint_match_min_inliers: int = 12     # RANSAC inliers required for a genuine match
    fingerprint_match_min_inlier_ratio: float = 0.02
    fingerprint_max_templates: int = 5          # enrolled samples kept per finger (newest win)
    fingerprint_verify_min_fingers: int = 1     # of the 4 captured fingers, how many must match

    quality_min_face_area_pct: float = 8.0
    quality_max_face_area_pct: float = 70.0
    # Lowered 50 -> 20: the blur gate (Laplacian variance on the face crop) was
    # rejecting normal front-webcam enrollment shots — which are softer than DSLR
    # photos — e.g. a good capture measured var=31.7. 20 still rejects genuinely
    # out-of-focus / motion-blurred frames (typically <15) while admitting the
    # softer-but-usable webcam captures this app actually receives.
    quality_blur_threshold: float = 20.0

    max_payload_mb: int = 5
    inference_timeout_s: int = 8

    liveness_hmac_secret: str = "change_me_liveness_secret"

    redis_url: str = ""

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),
        protected_namespaces=("settings_",),
    )

@lru_cache()
def get_settings() -> Settings:
    return Settings()
