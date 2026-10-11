import pytest
import numpy as np
import cv2

from app.face.quality import check_quality, QualityReport, QualityIssue


@pytest.fixture
def good_image():
    img = np.random.randint(50, 200, (480, 640, 3), dtype=np.uint8)
    return img


@pytest.fixture
def good_bbox():
    return np.array([100, 80, 540, 400])


class TestCheckQuality:
    def test_good_face_passes(self, good_image, good_bbox):
        report = check_quality(good_image, good_bbox)
        assert isinstance(report, QualityReport)
        assert report.passed is True
        assert len(report.issues) == 0
        assert "face_area_pct" in report.scores
        assert "blur_score" in report.scores
        assert "brightness" in report.scores

    def test_tiny_face_fails(self, good_image):
        tiny_bbox = np.array([300, 200, 310, 210])
        report = check_quality(good_image, tiny_bbox)
        assert report.passed is False
        assert any(i.code == "face_too_small" for i in report.issues)

    def test_giant_face_fails(self):
        img = np.random.randint(50, 200, (100, 100, 3), dtype=np.uint8)
        giant_bbox = np.array([0, 0, 99, 99])
        report = check_quality(img, giant_bbox)
        assert report.passed is False
        assert any(i.code == "face_too_large" for i in report.issues)

    def test_blurry_face_fails(self):
        img = np.full((480, 640, 3), 128, dtype=np.uint8)
        bbox = np.array([100, 80, 540, 400])
        report = check_quality(img, bbox, blur_threshold=1.0)
        assert not report.passed
        assert any(i.code == "blur" for i in report.issues)

    def test_dark_face_fails(self):
        img = np.full((480, 640, 3), 10, dtype=np.uint8)
        bbox = np.array([100, 80, 540, 400])
        report = check_quality(img, bbox)
        assert not report.passed
        assert any(i.code == "too_dark" for i in report.issues)

    def test_bright_face_fails(self):
        img = np.full((480, 640, 3), 250, dtype=np.uint8)
        bbox = np.array([100, 80, 540, 400])
        report = check_quality(img, bbox)
        assert not report.passed
        assert any(i.code == "too_bright" for i in report.issues)

    def test_empty_crop_fails(self, good_image):
        oob_bbox = np.array([0, 0, 0, 0])
        report = check_quality(good_image, oob_bbox)
        assert report.passed is False
        assert any(i.code == "no_face" for i in report.issues)

    def test_custom_thresholds(self, good_image, good_bbox):
        report = check_quality(
            good_image, good_bbox,
            blur_threshold=1000.0,
            min_face_area_pct=90.0,
        )
        assert not report.passed

    def test_scores_populated(self, good_image, good_bbox):
        report = check_quality(good_image, good_bbox)
        assert "face_area_pct" in report.scores
        assert "blur_score" in report.scores
        assert "brightness" in report.scores
        assert report.scores["face_area_pct"] > 0

    def test_issue_severity(self, good_image):
        tiny_bbox = np.array([300, 200, 310, 210])
        report = check_quality(good_image, tiny_bbox)
        for issue in report.issues:
            assert issue.severity in ("fail", "warn")
            assert issue.code
            assert issue.message


class TestQualityReport:
    def test_default_values(self):
        report = QualityReport(passed=True)
        assert report.passed is True
        assert report.issues == []
        assert report.scores == {}

    def test_with_issues(self):
        issues = [QualityIssue(code="test", message="test issue", severity="fail")]
        report = QualityReport(passed=False, issues=issues, scores={"blur": 10})
        assert len(report.issues) == 1
        assert report.scores["blur"] == 10
