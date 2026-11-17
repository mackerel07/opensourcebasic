"""Evaluate automatic counts/statuses. Standard library only; no model inference.

Requires every truth scene to have one prediction, including failed scenes.
Only pre-correction automatic predictions belong in this input file.
"""
import argparse
import csv
import json
import math
from pathlib import Path
from statistics import NormalDist, median

TARGETS = ("calculator", "scissors", "mouse")
STATUSES = {"complete", "missing", "review", "error"}


def rate(numerator, denominator):
    if denominator == 0:
        return {"numerator": numerator, "denominator": 0, "rate": None, "wilson95": None}
    p = numerator / denominator
    z = NormalDist().inv_cdf(0.975)
    denom = 1 + z * z / denominator
    center = (p + z * z / (2 * denominator)) / denom
    half = z * math.sqrt(p * (1 - p) / denominator + z * z / (4 * denominator ** 2)) / denom
    return {"numerator": numerator, "denominator": denominator, "rate": p,
            "wilson95": [max(0.0, center - half), min(1.0, center + half)]}


def load_csv(path):
    with Path(path).open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    ids = [r["scene_id"] for r in rows]
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate scene_id")
    return {r["scene_id"]: r for r in rows}


def percentile(values, q):
    values = sorted(values)
    if not values:
        return None
    position = (len(values) - 1) * q
    low, high = math.floor(position), math.ceil(position)
    return values[low] + (values[high] - values[low]) * (position - low)


def evaluate(truth, prediction):
    if set(truth) != set(prediction):
        raise ValueError("Truth/prediction scene IDs differ; include failures rather than dropping scenes")
    n = len(truth)
    if not n:
        raise ValueError("No scenes")
    missing_n = full_n = false_complete = missing_flag = action_flag = 0
    false_missing = reviews = errors = count_exact = workflow_correct = decided_correct = decided_n = 0
    abs_errors = {c: 0 for c in TARGETS}
    latency = []
    for scene_id, t in truth.items():
        p = prediction[scene_id]
        actual = {c: int(t[c]) for c in TARGETS}
        expected = {c: int(t["expected_" + c]) for c in TARGETS}
        predicted = {c: int(p[c]) for c in TARGETS}
        if any(v < 0 for d in (actual, expected, predicted) for v in d.values()):
            raise ValueError("Counts cannot be negative")
        if any(actual[c] > expected[c] for c in TARGETS):
            raise ValueError("This prototype evaluator assumes no extra target objects in ground truth")
        status = p["status"]
        if status not in STATUSES:
            raise ValueError("Invalid status")
        if status == "complete" and predicted != expected:
            raise ValueError(f"Inconsistent complete status: {scene_id}")
        if status == "missing" and not any(predicted[c] < expected[c] for c in TARGETS):
            raise ValueError(f"Inconsistent missing status: {scene_id}")
        is_missing = any(actual[c] < expected[c] for c in TARGETS)
        missing_n += is_missing
        full_n += not is_missing
        false_complete += is_missing and status == "complete"
        missing_flag += is_missing and status == "missing"
        action_flag += is_missing and status in {"missing", "review", "error"}
        false_missing += not is_missing and status == "missing"
        reviews += status == "review"
        errors += status == "error"
        exact = predicted == actual and status != "error"
        count_exact += exact
        correct = exact and status == ("missing" if is_missing else "complete")
        workflow_correct += correct
        if status in {"complete", "missing"}:
            decided_n += 1
            decided_correct += correct
        for c in TARGETS:
            abs_errors[c] += abs(predicted[c] - actual[c])
        elapsed = float(p["latency_ms"])
        if not math.isfinite(elapsed) or elapsed < 0:
            raise ValueError("latency_ms must be a finite nonnegative number")
        latency.append(elapsed)
    return {
        "n_scenes": n,
        "n_actually_missing": missing_n,
        "n_actually_complete": full_n,
        "false_complete_among_missing": rate(false_complete, missing_n),
        "explicit_missing_recall": rate(missing_flag, missing_n),
        "action_rate_among_missing_including_review_and_error": rate(action_flag, missing_n),
        "false_missing_among_complete": rate(false_missing, full_n),
        "review_rate": rate(reviews, n),
        "error_rate": rate(errors, n),
        "count_exact_match": rate(count_exact, n),
        "strict_automatic_success_review_and_error_are_failures": rate(workflow_correct, n),
        "automatic_decision_coverage": rate(decided_n, n),
        "accuracy_only_on_decided_scenes": rate(decided_correct, decided_n),
        "count_mae": {c: abs_errors[c] / n for c in TARGETS},
        "latency_ms": {"median": median(latency), "p95": percentile(latency, .95),
                       "max": max(latency)},
        "limitations": ["Wilson intervals assume approximately independent scenes.",
                        "Repeated shots of one scene are not independent replications.",
                        "No box/mask localization or instance matching is evaluated by this script.",
                        "Latency must include attempted inference on failed scenes too."],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--truth", required=True)
    parser.add_argument("--predictions", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    result = evaluate(load_csv(args.truth), load_csv(args.predictions))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
