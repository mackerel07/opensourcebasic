"""Meaningful data-leakage and accounting checks; no model weights needed."""
import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from scene_metrics import evaluate, rate
from train_head import CLASSES, read_manifest
from infer_scene import clean_candidates, decide, suppress_instance_duplicates


class DataChecks(unittest.TestCase):
    def manifest(self, base, same_group=False, duplicate=False):
        Image.new("RGB", (16, 16), (255, 0, 0)).save(base / "a.png")
        Image.new("RGB", (16, 16), (255, 0, 0) if duplicate else (0, 255, 0)).save(base / "b.png")
        path = base / "manifest.csv"
        with path.open("w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["path", "label", "split", "group", "source"])
            writer.writerow(["a.png", "calculator", "train", "session_a", "local"])
            writer.writerow(["b.png", "calculator", "test", "session_a" if same_group else "session_b", "local"])
        return path

    def test_group_leakage_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "Group leaks"):
                read_manifest(self.manifest(Path(directory), same_group=True))

    def test_identical_image_leakage_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "Identical image"):
                read_manifest(self.manifest(Path(directory), duplicate=True))

    def test_valid_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(len(read_manifest(self.manifest(Path(directory)))), 2)


class CandidateChecks(unittest.TestCase):
    def test_whole_candidate_survives_part_with_moderate_mask_overlap(self):
        whole = np.zeros((10, 10), dtype=bool)
        whole[1:9, 1:9] = True
        part = whole.copy()
        part[1:3] = False
        proposals = [
            {"segmentation": part, "predicted_iou": .99, "stability_score": .99},
            {"segmentation": whole, "predicted_iou": .4, "stability_score": .85},
        ]
        config = {"min_area_ratio": .001, "max_area_ratio": .8,
                  "mask_iou_suppress": .95, "max_candidates": 128}
        self.assertEqual(len(clean_candidates(proposals, whole.shape, config)[0]), 2)

    def test_disjoint_parts_inside_one_object_box_are_not_double_counted(self):
        records = [
            {"candidate_id": 0, "label": "scissors", "accepted": True, "score": .99, "bbox_xyxy": [0, 0, 100, 100]},
            {"candidate_id": 1, "label": "scissors", "accepted": True, "score": .8, "bbox_xyxy": [10, 10, 80, 30]},
        ]
        counts, status = decide(suppress_instance_duplicates(records), {"scissors": 1}, [])
        self.assertEqual(counts, {"scissors": 1})
        self.assertEqual(status, "complete")

    def test_two_separate_instances_of_same_label_are_preserved(self):
        records = [
            {"candidate_id": i, "label": "scissors", "accepted": True, "score": .99, "bbox_xyxy": box}
            for i, box in enumerate([[0, 0, 100, 100], [60, 60, 160, 160]])
        ]
        counts, _ = decide(suppress_instance_duplicates(records), {"scissors": 2}, [])
        self.assertEqual(counts, {"scissors": 2})

    def test_uncertain_different_object_inside_box_still_requests_review(self):
        records = [
            {"candidate_id": 0, "label": "mouse", "accepted": True, "score": .99, "bbox_xyxy": [0, 0, 100, 100]},
            {"candidate_id": 1, "label": "scissors", "accepted": False, "score": .6, "bbox_xyxy": [10, 10, 30, 30]},
        ]
        _, status = decide(suppress_instance_duplicates(records), {"mouse": 1, "scissors": 1}, [])
        self.assertEqual(status, "review")

    def test_small_part_does_not_suppress_whole_item(self):
        whole = np.zeros((10, 10), dtype=bool)
        whole[1:8, 1:8] = True
        part = np.zeros_like(whole)
        part[2:4, 2:4] = True
        proposals = [
            {"segmentation": part, "predicted_iou": 0.98, "stability_score": 1.0},
            {"segmentation": whole, "predicted_iou": 0.92, "stability_score": 1.0},
            {"segmentation": whole.copy(), "predicted_iou": 0.90, "stability_score": 1.0},
        ]
        config = {"min_area_ratio": 0.001, "max_area_ratio": 0.8,
                  "mask_iou_suppress": 0.6, "max_candidates": 64}

        kept, warnings = clean_candidates(proposals, whole.shape, config)

        self.assertEqual(len(kept), 2)
        self.assertIs(kept[0], proposals[0])
        self.assertIs(kept[1], proposals[1])
        self.assertEqual(warnings, [])


class DecisionChecks(unittest.TestCase):
    def test_empty_segmentation_requires_review_instead_of_false_missing(self):
        counts, status = decide([], dict.fromkeys(CLASSES[:3], 1), [])
        self.assertEqual(counts, dict.fromkeys(CLASSES[:3], 0))
        self.assertEqual(status, "review")

    def test_untrained_never_complete(self):
        counts, status = decide([], {"calculator": 1, "scissors": 1, "mouse": 1}, ["classifier_not_supplied"])
        self.assertEqual(status, "review")

    def test_uncertainty_not_silently_dropped(self):
        records = [{"label": c, "accepted": True} for c in CLASSES[:3]]
        records.append({"label": "other", "accepted": False})
        self.assertEqual(decide(records, dict.fromkeys(CLASSES[:3], 1), [])[1], "review")

    def test_duplicate_count_needs_review(self):
        records = [{"label": c, "accepted": True} for c in ["calculator", "calculator", "scissors", "mouse"]]
        self.assertEqual(decide(records, dict.fromkeys(CLASSES[:3], 1), [])[1], "review")

    def test_no_denominator_does_not_mean_zero_error(self):
        self.assertIsNone(rate(0, 0)["rate"])

    def test_prediction_failures_cannot_be_omitted(self):
        with self.assertRaisesRegex(ValueError, "scene IDs differ"):
            evaluate({"missing_scene": {}}, {})

    def test_review_is_not_counted_as_automatic_success(self):
        truth = {"x": {"calculator": "1", "scissors": "1", "mouse": "0",
                        "expected_calculator": "1", "expected_scissors": "1", "expected_mouse": "1"}}
        pred = {"x": {"calculator": "1", "scissors": "1", "mouse": "0", "status": "review", "latency_ms": "100"}}
        result = evaluate(truth, pred)
        self.assertEqual(result["count_exact_match"]["rate"], 1)
        self.assertEqual(result["strict_automatic_success_review_and_error_are_failures"]["rate"], 0)


class ClassifierExecution(unittest.TestCase):
    def test_fit_and_evaluate_on_explicitly_synthetic_vectors(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            rng = np.random.default_rng(42)
            centers = np.eye(4, 384, dtype=np.float32) * 5
            features, labels, splits, groups = [], [], [], []
            for split, n in [("train", 8), ("val", 3), ("test", 3)]:
                for class_id, label in enumerate(CLASSES):
                    for i in range(n):
                        features.append(centers[class_id] + rng.normal(0, .02, 384))
                        labels.append(label)
                        splits.append(split)
                        groups.append(f"synthetic_{split}_{label}_{i}")
            np.savez_compressed(base / "features.npz", X=np.asarray(features), y=labels,
                                split=splits, group=groups, source=["synthetic"] * len(labels),
                                path=groups, contract=json.dumps({"synthetic_fixture": True}))
            script = Path(__file__).with_name("train_head.py")
            subprocess.run([sys.executable, str(script), "fit", "--features", str(base / "features.npz"),
                            "--outdir", str(base / "models")], check=True, capture_output=True)
            subprocess.run([sys.executable, str(script), "evaluate", "--features", str(base / "features.npz"),
                            "--model", str(base / "models/head.joblib"), "--outdir", str(base / "eval")],
                           check=True, capture_output=True)
            report = json.loads((base / "eval/crop_metrics.json").read_text())
            selection = json.loads((base / "models/selection.json").read_text())
            self.assertEqual(selection["selected_C"], 100.0)
            self.assertLess(selection["selection"][-1]["val_log_loss"],
                            selection["selection"][0]["val_log_loss"])
            self.assertEqual(report["n"], 12)
            self.assertEqual(report["accuracy"], 1)
            self.assertTrue((base / "eval/confusion_matrix.png").is_file())


if __name__ == "__main__":
    unittest.main()
