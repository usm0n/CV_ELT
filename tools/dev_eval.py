"""Score every rule (or a chosen subset) against labels/dev_labels.json from cached observations.

    WIUT_CACHE_DIR=.cache python tools/dev_eval.py [class ...]

Prints per-class F1 at tIoU 0.3/0.5/0.7 with the official matching, plus each prediction
and label so misses and false alarms can be inspected.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from evaluate import TIOU_THRESHOLDS as THRESHOLDS, match_segments  # noqa: E402
from src.events import load_rules  # noqa: E402
from src.events.segments import finalize  # noqa: E402
from src.pipeline import analyze  # noqa: E402

GT = json.loads(Path("labels/dev_labels.json").read_text())


def main() -> None:
    rules = load_rules()
    labels = sys.argv[1:] or sorted(rules)
    preds: dict[str, dict[str, list]] = {}
    for vid in sorted(GT):
        ctx, cands = analyze(str(Path("samples") / vid), labels)
        preds[vid] = {c: finalize(cands[c], ctx.meta.duration, rules[c].merge_gap, rules[c].min_len)
                      for c in labels}
    for c in labels:
        f1s = []
        for tau in THRESHOLDS:
            tp = fp = fn = 0
            for vid in GT:
                g = [(s, e) for s, e, l in GT[vid]["events"] if l == c]
                a, b, d = match_segments(g, preds[vid][c], tau)
                tp, fp, fn = tp + a, fp + b, fn + d
            f1s.append(2 * tp / max(1, 2 * tp + fp + fn))
        print(f"\n== {c}: F1@.3/.5/.7 = " + " / ".join(f"{f:.2f}" for f in f1s)
              + f"  mean {sum(f1s) / 3:.3f}")
        for vid in sorted(GT):
            g = [(s, e) for s, e, l in GT[vid]["events"] if l == c]
            if g or preds[vid][c]:
                print(f"  {vid}  gt={g}")
                print(f"  {' ' * len(vid)}  pr={preds[vid][c]}")


if __name__ == "__main__":
    main()
