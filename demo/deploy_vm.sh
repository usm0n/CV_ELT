#!/usr/bin/env bash
# Deploy the demo API to a Docker host over SSH. Run from the repository root:
#   DEMO_HOST=<ssh host> bash demo/deploy_vm.sh
# The container listens on 127.0.0.1:7860 only and is capped at 2 CPUs / 6 GB so it cannot starve
# other services on the host. Public HTTPS comes from a reverse proxy or a Cloudflare tunnel:
# set DEMO_NETWORK to the tunnel's Docker network and point the tunnel at http://wiut-demo:7860.
# DEMO_SAMPLE_FILE=<local .mp4> also uploads the clip behind the page's "Try our sample clip" button
# (we use 45 s of C3902: ffmpeg -ss 78 -i samples/C3902.MP4 -t 45 -c copy -an sample.mp4).
set -euo pipefail
: "${DEMO_HOST:?set DEMO_HOST=<ssh host>}"
DEMO_NETWORK=${DEMO_NETWORK:-bridge}
DEMO_ORIGINS=${DEMO_ORIGINS:-*}

rsync -az --delete --exclude __pycache__ solution.py requirements.txt src weights demo "$DEMO_HOST:wiut-demo/"
ssh "$DEMO_HOST" mkdir -p wiut-demo-media
if [ -n "${DEMO_SAMPLE_FILE:-}" ]; then
  rsync -a --partial "$DEMO_SAMPLE_FILE" "$DEMO_HOST:wiut-demo-media/sample.mp4"
fi
ssh "$DEMO_HOST" bash -s <<EOF
set -euo pipefail
cd wiut-demo
cp demo/Dockerfile Dockerfile
nice -n 10 docker build -q -t wiut-demo:latest .
docker rm -f wiut-demo >/dev/null 2>&1 || true
docker run -d --name wiut-demo --restart unless-stopped \
  --network "$DEMO_NETWORK" -p 127.0.0.1:7860:7860 \
  --cpus 2 --memory 6g -e DEMO_ORIGINS="$DEMO_ORIGINS" \
  -v "\$HOME/wiut-demo-media:/data:ro" -e DEMO_SAMPLE=/data/sample.mp4 wiut-demo:latest
EOF
echo "deployed; check: ssh $DEMO_HOST curl -s localhost:7860/health"
