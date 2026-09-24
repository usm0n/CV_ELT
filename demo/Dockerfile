# Live-demo image for a Hugging Face Space (Docker SDK, CPU).
# Build from the repository root:  docker build -f demo/Dockerfile -t wiut-demo .
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Spaces run as uid 1000 with a read-only home; keep caches and job files in /tmp.
ENV HOME=/tmp YOLO_CONFIG_DIR=/tmp/ultralytics DEMO_JOBS_DIR=/tmp/demo_jobs \
    PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt /tmp/reqs/model.txt
COPY demo/requirements.txt /tmp/reqs/demo.txt
# CPU wheels of torch (the PyPI default bundles CUDA and is several GB larger)
RUN pip install torch==2.14.0 torchvision==0.29.0 --index-url https://download.pytorch.org/whl/cpu \
    && grep -vE '^(torch|torchvision)==' /tmp/reqs/model.txt > /tmp/reqs/model-cpu.txt \
    && pip install -r /tmp/reqs/model-cpu.txt -r /tmp/reqs/demo.txt

COPY solution.py ./
COPY src ./src
COPY weights ./weights
COPY demo ./demo

USER 1000
EXPOSE 7860
CMD ["uvicorn", "demo.app:app", "--host", "0.0.0.0", "--port", "7860"]
