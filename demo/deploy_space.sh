#!/usr/bin/env bash
# Push the demo to a Hugging Face Space (Docker SDK). Run from the repository root:
#   HF_SPACE=<user>/<space> bash demo/deploy_space.sh
# Needs the `hf` CLI (pip install "huggingface_hub[cli]") and `hf auth login` with write access.
# The Space gets the Dockerfile at its root plus the model code; the Space is created if missing.
set -euo pipefail
: "${HF_SPACE:?set HF_SPACE=<user>/<space>}"
HF=${HF:-hf}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

cp -r solution.py requirements.txt src weights demo "$work/"
cp demo/Dockerfile "$work/Dockerfile"
cp demo/SPACE_README.md "$work/README.md"
find "$work" -name __pycache__ -prune -exec rm -rf {} +

"$HF" repos create "$HF_SPACE" --repo-type space --space-sdk docker --public --exist-ok
"$HF" upload "$HF_SPACE" "$work" . --repo-type space --delete "*" \
  --commit-message "Deploy demo from $(git rev-parse --short HEAD)"
