FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libsm6 libxext6 libxrender-dev \
    libgles2 libegl1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# ARM64/aarch64 (Oracle server) pins: mediapipe ships linux-aarch64 wheels only
# up to 0.10.18 (0.10.30+ are macOS-arm64 only), and insightface 1.0.1 is a
# pure-Python wheel. These versions also have x86_64 wheels, so the image still
# builds on amd64. Keep in sync with the old-server behavior (mediapipe 0.10.x).
RUN pip install --no-cache-dir --no-deps "insightface==1.0.1" "mediapipe==0.10.18"

# mediapipe/insightface were installed --no-deps above (to keep our pinned numpy/
# opencv-headless). Install the pure-Python runtime deps they still need. WITHOUT
# these, `import mediapipe` fails (No module named 'attr'; protobuf>=4 dropped
# MessageFactory.GetPrototype) and the liveness service SILENTLY degrades to a
# motion-only optical-flow fallback that accepts ANY movement — so the specific
# gesture challenges are not actually enforced (a genuine spoofing hole). protobuf
# is pinned <4 for mediapipe 0.10.x; onnxruntime/onnx/insightface work with it
# (verified in a throwaway container before this change).
RUN pip install --no-cache-dir "attrs>=19.1.0" "protobuf>=3.20,<4" "sounddevice>=0.4.4" "absl-py" "flatbuffers>=2.0"

RUN mkdir -p /app/models/anti_spoof

COPY . .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "30"]
