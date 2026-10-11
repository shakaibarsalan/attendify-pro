import numpy as np
import cv2
import base64
from typing import Optional, Tuple

class FaceService:
    def __init__(self, model_dir: str = "./models"):
        self.model_dir = model_dir
        self.face_detector = None
        self.face_analyzer = None
        self._initialized = False

    def initialize(self):
        if self._initialized:
            return
        try:
            from insightface.app import FaceAnalysis
            self.face_analyzer = FaceAnalysis(
                name="buffalo_l",
                root=self.model_dir,
                allowed_modules=["detection", "recognition"]
            )
            self.face_analyzer.prepare(ctx_id=-1, det_size=(640, 640))
            self._initialized = True
        except Exception as e:
            print(f"Warning: InsightFace initialization failed: {e}")
            print("Using fallback face detection with OpenCV")
            self._initialize_fallback()

    def _initialize_fallback(self):
        self.face_detector = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        self._initialized = True
        print("Fallback mode: using OpenCV Haar cascade + pixel-hash embeddings")

    def decode_image(self, image_data: str) -> Optional[np.ndarray]:
        try:
            if image_data.startswith("data:image"):
                image_data = image_data.split(",")[1]
            img_bytes = base64.b64decode(image_data)
            img_array = np.frombuffer(img_bytes, dtype=np.uint8)
            return cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        except Exception:
            return None

    # Real-time guidance only needs to locate an attendance-sized face (>=8% of
    # frame), so a 320x320 detection pass is plenty and ~4x cheaper on CPU than
    # the 640x640 pass used for accurate verification. Bboxes are returned in
    # original-image coordinates regardless, so the centering math is unaffected.
    GUIDANCE_DET_SIZE = (320, 320)

    def detect_only(self, image: np.ndarray) -> Optional[Tuple[np.ndarray, float]]:
        """Detection-only (no ArcFace embedding) for the real-time 'center your
        face' guidance loop.

        The full detect_and_embed() runs the recognition forward pass, which
        dominates per-frame CPU cost and is pointless when we only need to know
        *where* the face is. Running it ~1.4x/sec per student saturates the
        single-VM CPU, so guidance calls queue past the client timeout and the
        user sees no feedback at all. This path runs ONLY the detector (the same
        SCRFD model FaceAnalysis.get() uses internally), at a lower resolution.
        Returns (bbox[x1,y1,x2,y2], score) or None when no face is present.
        """
        if not self._initialized:
            self.initialize()

        if self.face_analyzer is None:
            return None

        det_model = getattr(self.face_analyzer, "det_model", None)
        if det_model is None:
            # Unexpected build without a separable detector — fall back to the
            # full pipeline rather than break guidance entirely.
            full = self.detect_and_embed(image)
            if full is None:
                return None
            _, bbox, meta = full
            return bbox, float(meta.get("confidence", 1.0))

        try:
            bboxes, _ = det_model.detect(image, input_size=self.GUIDANCE_DET_SIZE, max_num=0, metric="default")
        except TypeError:
            # Older detector signature without per-call input_size.
            bboxes, _ = det_model.detect(image, max_num=0, metric="default")
        if bboxes is None or len(bboxes) == 0:
            return None
        best = max(bboxes, key=lambda r: (r[2] - r[0]) * (r[3] - r[1]))
        bbox = best[:4].astype(int)
        score = float(best[4]) if len(best) > 4 else 1.0
        return bbox, score

    def detect_and_embed(self, image: np.ndarray) -> Optional[Tuple[np.ndarray, np.ndarray, dict]]:
        if not self._initialized:
            self.initialize()

        if self.face_analyzer:
            faces = self.face_analyzer.get(image)
            if len(faces) == 0:
                return None
            face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
            embedding = face.embedding / np.linalg.norm(face.embedding)
            bbox = face.bbox.astype(int)
            quality = float((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]))
            return embedding, bbox, {"quality": quality, "confidence": float(face.det_score)}
        # Fallback (OpenCV Haar cascade) cannot produce ArcFace-compatible embeddings;
        # return None so callers surface a proper error instead of storing garbage data.
        return None

    def verify_face(self, query_embedding: np.ndarray, stored_embeddings: list) -> dict:
        if not stored_embeddings:
            return {"verified": False, "confidence": 0, "best_match": None}

        similarities = []
        for emb_record in stored_embeddings:
            stored = emb_record["embedding"]
            sim = float(np.dot(query_embedding, stored))
            similarities.append({"user_id": emb_record["user_id"], "similarity": sim})

        similarities.sort(key=lambda x: x["similarity"], reverse=True)
        best = similarities[0]
        from app.core.config import get_settings
        threshold = get_settings().match_threshold

        return {
            "verified": best["similarity"] >= threshold,
            "confidence": best["similarity"],
            "best_match_user_id": best["user_id"],
            "best_match_score": best["similarity"],
            "all_scores": similarities[:5],
        }

face_service = FaceService()
