import pytest
import numpy as np
import cv2
from unittest.mock import patch, MagicMock

from app.face.anti_spoof import (
    AntiSpoofDetector, AntiSpoofResult, TextureAnalyzer,
    DepthAnalyzer, MotionAnalyzer, _crop_face, is_spoofed,
)


@pytest.fixture
def sample_image():
    return np.random.randint(0, 255, (200, 200, 3), dtype=np.uint8)


@pytest.fixture
def sample_bbox():
    return np.array([30, 30, 170, 170])


class TestCropFace:
    def test_basic_crop(self, sample_image, sample_bbox):
        crop = _crop_face(sample_image, sample_bbox)
        assert crop is not None
        assert crop.shape[0] > 0
        assert crop.shape[1] > 0

    def test_crop_with_scale(self, sample_image, sample_bbox):
        crop1 = _crop_face(sample_image, sample_bbox, scale=1.5)
        crop2 = _crop_face(sample_image, sample_bbox, scale=3.0)
        assert crop2.shape[0] >= crop1.shape[0]

    def test_empty_image(self):
        empty = np.array([], dtype=np.uint8)
        bbox = np.array([0, 0, 10, 10])
        try:
            _crop_face(empty.reshape(0, 0, 3), bbox)
        except Exception:
            pass


class TestAntiSpoofResult:
    def test_creation(self):
        r = AntiSpoofResult(is_real=True, confidence=0.95, method="test")
        assert r.is_real is True
        assert r.confidence == 0.95
        assert r.method == "test"
        assert r.raw_scores == {}


class TestTextureAnalyzer:
    def test_analyze_returns_dict(self, sample_image, sample_bbox):
        analyzer = TextureAnalyzer()
        result = analyzer.analyze(sample_image, sample_bbox)
        assert isinstance(result, dict)
        assert "score" in result
        assert "high_freq_ratio" in result
        assert "lbp_entropy" in result
        assert "luminance_std" in result
        assert "saturation_std" in result

    def test_empty_crop(self, sample_image):
        bbox = np.array([250, 250, 260, 260])
        analyzer = TextureAnalyzer()
        result = analyzer.analyze(sample_image, bbox)
        assert isinstance(result, dict)
        assert result["score"] == 0.0

    def test_compute_lbp(self):
        analyzer = TextureAnalyzer()
        gray = np.random.randint(0, 255, (50, 50), dtype=np.uint8)
        lbp = analyzer._compute_lbp(gray)
        assert lbp.shape == gray.shape
        assert lbp.dtype == np.uint8
        assert np.all(lbp >= 0) and np.all(lbp <= 255)

    def test_histogram(self):
        analyzer = TextureAnalyzer()
        arr = np.array([0, 1, 2, 3, 4])
        hist = analyzer._histogram(arr, 10)
        assert len(hist) == 10
        assert hist[0] == 1
        assert hist[4] == 1


class TestDepthAnalyzer:
    def test_no_landmarker_returns_default(self, sample_image):
        analyzer = DepthAnalyzer()
        analyzer._landmarker = None
        with patch.object(analyzer, '_get_landmarker', return_value=None):
            result = analyzer.analyze(sample_image)
        assert isinstance(result, dict)
        assert result["score"] == 0.5
        assert result["available"] is False


class TestMotionAnalyzer:
    def test_no_prev_image(self, sample_image, sample_bbox):
        analyzer = MotionAnalyzer()
        result = analyzer.analyze(None, sample_image, sample_bbox)
        assert isinstance(result, dict)
        assert result["score"] == 0.5
        assert result["available"] is False

    def test_with_prev_image(self, sample_image, sample_bbox):
        analyzer = MotionAnalyzer()
        prev = np.random.randint(0, 255, (200, 200, 3), dtype=np.uint8)
        result = analyzer.analyze(prev, sample_image, sample_bbox)
        assert isinstance(result, dict)
        assert "score" in result
        assert "avg_motion" in result


class TestAntiSpoofDetector:
    def test_initialize(self):
        det = AntiSpoofDetector(model_dir="/nonexistent", threshold=0.5)
        det.initialize()
        assert det.method_name == "multi_signal"
        assert det._initialized is True

    @patch("app.core.config.get_settings")
    def test_get_detector_creates_instance(self, mock_settings):
        mock_settings.return_value = MagicMock(
            anti_spoof_model_dir="/tmp", anti_spoof_threshold=0.7,
        )
        import app.face.anti_spoof as module
        module.anti_spoof_detector = None
        det = module.get_anti_spoof_detector()
        assert isinstance(det, AntiSpoofDetector)

    def test_predict_returns_multi_signal(self, sample_image, sample_bbox):
        det = AntiSpoofDetector(model_dir="/nonexistent", threshold=0.5)
        det.initialize()
        result = det.predict(sample_image, sample_bbox)
        assert isinstance(result, AntiSpoofResult)
        assert result.method == "multi_signal"
        assert "texture" in result.raw_scores
        assert "depth" in result.raw_scores
        assert "motion" in result.raw_scores

    def test_is_spoofed_function(self, sample_image, sample_bbox):
        with patch("app.face.anti_spoof.get_anti_spoof_detector") as mock:
            mock_det = MagicMock()
            mock_det.predict.return_value = AntiSpoofResult(is_real=True, confidence=0.8, method="test")
            mock.return_value = mock_det
            result = is_spoofed(sample_image, sample_bbox)
            assert result.is_real is True
