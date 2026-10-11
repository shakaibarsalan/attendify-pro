"""
Face-recognition ACCURACY harness for the production buffalo_l model.

This is a MANUAL/LOCAL harness, not a CI test — it is deliberately NOT named
`test_*` so pytest does not collect it (it needs the ~280 MB buffalo_l model and
network access to fetch sample faces). Run it directly to reproduce the
genuine-accept / impostor-reject measurement that validates the face pipeline:

    python -m venv venv && venv/Scripts/pip install insightface onnxruntime opencv-python-headless
    python ai-service/tests/face_accuracy_local.py            # downloads 8 sample faces
    python ai-service/tests/face_accuracy_local.py /path/dir  # or use your own p*.jpg

It replicates ai-service/app/face/service.py exactly:
  - InsightFace buffalo_l, allowed_modules=[detection, recognition]
  - det_size=(640,640), ctx_id=-1 (CPU)
  - L2-normalized ArcFace embedding, cosine similarity = np.dot(a, b)
  - decision threshold = settings.match_threshold = 0.55

Genuine pairs  = same identity under realistic capture variation (mirror,
                 brightness, rotation+scale, blur+JPEG recompression).
Impostor pairs = every cross-identity pair (originals AND augmented) — the
                 hardest 1:N false-accept scenarios.

Reference result (8 distinct identities, 40 genuine / 168 impostor pairs):
    GENUINE  min=0.878 mean=0.959 max=0.991
    IMPOSTOR min=-0.021 mean=0.130 max=0.328
    True Accept Rate = 100% (40/40)   False Accept Rate = 0% (0/168)
    Separation gap (min genuine - max impostor) = +0.550
"""
import os, sys, glob, itertools, urllib.request
import numpy as np
import cv2
from insightface.app import FaceAnalysis

THRESHOLD = 0.55           # == match_threshold / recognition_threshold in config.py
N_FACES = 8

def fetch_sample_faces(dir_):
    """Download N distinct synthetic portraits (different identities each call)."""
    os.makedirs(dir_, exist_ok=True)
    ua = {"User-Agent": "Mozilla/5.0"}
    got = 0
    for i in range(N_FACES):
        dst = os.path.join(dir_, f"p{i}.jpg")
        if os.path.exists(dst) and os.path.getsize(dst) > 50000:
            got += 1; continue
        for _ in range(5):
            try:
                req = urllib.request.Request(f"https://thispersondoesnotexist.com/?x={i}{_}", headers=ua)
                data = urllib.request.urlopen(req, timeout=30).read()
                if len(data) > 50000:
                    open(dst, "wb").write(data); got += 1; break
            except Exception:
                pass
    print(f"sample faces ready: {got}/{N_FACES} in {dir_}")

def present(img):
    """Pad a neutral border so the face occupies ~40% of the frame (webcam scale).
    Source portraits often fill ~80% of the frame, which SCRFD@640 under-detects."""
    pad = max(img.shape[:2]) // 2
    return cv2.copyMakeBorder(img, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(120, 120, 120))

def jpeg(img, q=60):
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, q])
    return cv2.imdecode(buf, cv2.IMREAD_COLOR) if ok else img

def augment(img, kind):
    h, w = img.shape[:2]
    if kind == "mirror":    return cv2.flip(img, 1)
    if kind == "bright":    return cv2.convertScaleAbs(img, alpha=1.15, beta=25)
    if kind == "dark":      return cv2.convertScaleAbs(img, alpha=0.85, beta=-25)
    if kind == "rotate":    return cv2.warpAffine(img, cv2.getRotationMatrix2D((w/2, h/2), 8, 1.04), (w, h), borderMode=cv2.BORDER_REPLICATE)
    if kind == "blur_jpeg": return jpeg(cv2.GaussianBlur(img, (3, 3), 0))
    return img

AUGS = ["mirror", "bright", "dark", "rotate", "blur_jpeg"]

def main():
    dir_ = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "_face_samples")
    if not glob.glob(os.path.join(dir_, "p*.jpg")):
        fetch_sample_faces(dir_)

    app = FaceAnalysis(name="buffalo_l", allowed_modules=["detection", "recognition"])
    app.prepare(ctx_id=-1, det_size=(640, 640))

    def embed(img):
        faces = app.get(present(img))
        if not faces:
            return None
        f = max(faces, key=lambda x: (x.bbox[2]-x.bbox[0]) * (x.bbox[3]-x.bbox[1]))
        e = f.normed_embedding
        n = np.linalg.norm(e)
        return e / n if n > 0 else e

    ids = {}
    for p in sorted(glob.glob(os.path.join(dir_, "p*.jpg"))):
        name = os.path.splitext(os.path.basename(p))[0]
        img = cv2.imread(p)
        eo = embed(img) if img is not None else None
        if eo is None:
            print(f"  {name}: no face detected (excluded)"); continue
        ids[name] = {"orig": eo, "aug": {k: e for k in AUGS if (e := embed(augment(img, k))) is not None}}
        print(f"  {name}: ok ({len(ids[name]['aug'])}/{len(AUGS)} augmentations)")

    names = sorted(ids)
    print(f"\nUsable identities: {len(names)}\n" + "=" * 60)
    if len(names) < 2:
        print("Need >= 2 identities for impostor pairs."); return

    cos = lambda a, b: float(np.dot(a, b))
    genuine = [cos(ids[n]["orig"], e) for n in names for e in ids[n]["aug"].values()]
    impostor = []
    for a, b in itertools.combinations(names, 2):
        impostor.append(cos(ids[a]["orig"], ids[b]["orig"]))
        impostor += [cos(ids[a]["orig"], e) for e in ids[b]["aug"].values()]

    g, i = np.array(genuine), np.array(impostor)
    print(f"GENUINE  (same identity): n={len(g)}  min={g.min():.3f}  mean={g.mean():.3f}  max={g.max():.3f}")
    print(f"IMPOSTOR (diff identity): n={len(i)}  min={i.min():.3f}  mean={i.mean():.3f}  max={i.max():.3f}")
    print("=" * 60)
    fr = int((g < THRESHOLD).sum()); fa = int((i >= THRESHOLD).sum())
    print(f"\nThreshold = {THRESHOLD}")
    print(f"  True  Accept Rate (genuine  >= {THRESHOLD}) : {(1-fr/len(g))*100:.1f}%  ({len(g)-fr}/{len(g)})")
    print(f"  False Accept Rate (impostor >= {THRESHOLD}) : {(fa/len(i))*100:.1f}%  ({fa}/{len(i)})")
    print(f"  Separation gap (min genuine - max impostor) = {g.min()-i.max():+.3f}")
    print(f"\nVERDICT: {'PASS' if (fr == 0 and fa == 0 and g.min() > i.max()) else 'REVIEW'}")

if __name__ == "__main__":
    main()
