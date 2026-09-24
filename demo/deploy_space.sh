#!/usr/bin/env bash
# Push the demo to a Hugging Face Space (Docker SDK). Run from the repository root:
#   HF_SPACE=<user>/<space> bash demo/deploy_space.sh
# Needs git-lfs and a Hugging Face token with write access (`huggingface-cli login` or a
# credential helper). The Space repo gets the Dockerfile at its root plus the model code.
set -euo pipefail
: "${HF_SPACE:?set HF_SPACE=<user>/<space>}"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git clone "https://huggingface.co/spaces/${HF_SPACE}" "$work/space"
cd "$work/space"
git lfs install --local
git lfs track "*.pt" "*.npz" "*.jpg"
find . -mindepth 1 -maxdepth 1 ! -name .git ! -name .gitattributes -exec rm -rf {} +
cd - >/dev/null

cp -r solution.py requirements.txt src weights demo "$work/space/"
cp demo/Dockerfile "$work/space/Dockerfile"
cp demo/SPACE_README.md "$work/space/README.md"
find "$work/space" -name __pycache__ -prune -exec rm -rf {} +

cd "$work/space"
git add -A
git commit -m "Deploy demo from $(git -C "$OLDPWD" rev-parse --short HEAD)" || echo "nothing to deploy"
git push
