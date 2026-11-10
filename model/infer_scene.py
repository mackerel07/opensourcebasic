"""SAM2 automatic masks -> frozen DINOv2 -> optional trained classifier.

Without --classifier this exports mask/crop/features only and always requests
review. A supplied classifier must be one trained by train_head.py on real data.
"""
import argparse
import csv
import json
import os
import time
from pathlib import Path

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import joblib
import numpy as np
import torch
from PIL import Image, ImageDraw

from vision_runtime import (CLASSES, DinoEncoder, choose_device, load_rgb,
                            masked_crop, read_runtime, synchronize)


def mask_iou(a, b):
    intersection = int(np.logical_and(a, b).sum())
    union = int(a.sum()) + int(b.sum()) - intersection
    return intersection / union if union else 0.0


def clean_candidates(proposals, shape, config):
    # Heuristics must be validated on the actual tabletop, not on test scenes.
    pixels = shape[0] * shape[1]
    kept, warnings = [], []
    ordered = sorted(proposals, key=lambda a: float(a["predicted_iou"]) *
                     float(a["stability_score"]), reverse=True)
    for proposal in ordered:
        mask = np.asarray(proposal["segmentation"], dtype=bool)
        ratio = int(mask.sum()) / pixels
        if not config["min_area_ratio"] <= ratio <= config["max_area_ratio"]:
            continue
        # A part mask can be fully contained without duplicating a whole item.
        if any(mask_iou(mask, q["segmentation"]) > config["mask_iou_suppress"]
               for q in kept):
            continue
        if len(kept) >= config["max_candidates"]:
            warnings.append("candidate_limit_reached")
            break
        kept.append(proposal)
    return kept, warnings


def decide(records, expected, warnings):
    counts = {c: 0 for c in expected}
    for r in records:
        if r["accepted"] and r["label"] in counts:
            counts[r["label"]] += 1
    if warnings or any(not r["accepted"] for r in records) or any(
            counts[c] > expected[c] for c in counts):
        return counts, "review"
    return counts, "complete" if counts == expected else "missing"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True)
    parser.add_argument("--runtime", default="runtime.local.json")
    parser.add_argument("--config", default="inference_config.json")
    parser.add_argument("--classifier")
    parser.add_argument("--device", choices=["auto", "cpu", "mps", "cuda"], default="auto")
    parser.add_argument("--outdir", required=True)
    parser.add_argument("--scene-id")
    parser.add_argument("--predictions-csv")
    args = parser.parse_args()
    runtime = read_runtime(args.runtime)
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    output = Path(args.outdir)
    if (output / "result.json").exists():
        raise FileExistsError("Use a new output directory to preserve previous predictions")
    output.mkdir(parents=True, exist_ok=True)
    rgb = load_rgb(args.image)
    original_size = list(rgb.shape[:2])
    if max(rgb.shape[:2]) > config["max_image_edge"]:
        scale = config["max_image_edge"] / max(rgb.shape[:2])
        image = Image.fromarray(rgb)
        image = image.resize((round(rgb.shape[1] * scale), round(rgb.shape[0] * scale)))
        rgb = np.asarray(image).copy()
    device = choose_device(args.device)
    model_started = time.perf_counter()
    # Installed package contains its configs; official repository is not imported
    # as the top-level working directory (which SAM2 explicitly disallows).
    from sam2.build_sam import build_sam2
    from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
    sam = build_sam2("configs/sam2.1/sam2.1_hiera_s.yaml", runtime["sam2_checkpoint"],
                     device=device, apply_postprocessing=False)
    generator = SAM2AutomaticMaskGenerator(
        sam, points_per_side=config["points_per_side"],
        points_per_batch=config["points_per_batch"],
        pred_iou_thresh=config["pred_iou_thresh"],
        stability_score_thresh=config["stability_score_thresh"],
        box_nms_thresh=config["box_nms_thresh"], crop_n_layers=0,
        min_mask_region_area=0,
    )
    encoder = DinoEncoder(runtime["dino_repo"], runtime["dino_checkpoint"], device)
    bundle = joblib.load(args.classifier) if args.classifier else None
    if bundle is not None and bundle["contract"] != encoder.contract:
        raise ValueError("Classifier and DINO checkpoint/preprocessing do not match")
    synchronize(device)
    model_load_ms = (time.perf_counter() - model_started) * 1000
    started = time.perf_counter()
    with torch.inference_mode():
        proposals = generator.generate(rgb)
    synchronize(device)
    masks_ready = time.perf_counter()
    proposals, warnings = clean_candidates(proposals, rgb.shape, config)
    crops, boxes = [], []
    for proposal in proposals:
        crop, box = masked_crop(rgb, proposal["segmentation"])
        crops.append(crop)
        boxes.append(box)
    X = encoder.encode(crops, batch_size=config["feature_batch_size"])
    records = []
    if bundle is None:
        warnings.append("classifier_not_supplied")
    elif len(X):
        probability = bundle["estimator"].predict_proba(X)
        classes = list(bundle["estimator"].classes_)
        for i, score in enumerate(probability):
            order = np.argsort(score)[::-1]
            label = classes[order[0]]
            best = float(score[order[0]])
            margin = float(score[order[0]] - score[order[1]])
            accepted = best >= config["class_score_min"] and margin >= config["class_margin_min"]
            records.append({"candidate_id": i, "label": label, "score": best,
                            "margin": margin, "accepted": bool(accepted),
                            "scores": dict(zip(classes, map(float, score))), "bbox_xyxy": boxes[i]})
    if bundle is None:
        records = [{"candidate_id": i, "label": "untrained", "accepted": False,
                    "bbox_xyxy": boxes[i]} for i in range(len(crops))]
    expected = config["expected"]
    if set(expected) != set(CLASSES[:3]):
        raise ValueError("Expected inventory must specify calculator, scissors, mouse")
    counts, status = decide(records, expected, warnings)
    synchronize(device)
    latency_ms = (time.perf_counter() - started) * 1000
    result = {"scene_id": args.scene_id or Path(args.image).stem,
              "device": device, "status": status, "counts": counts, "expected": expected,
              "review_reasons": sorted(set(warnings + (["uncertain_candidates"] if any(
                  not r["accepted"] for r in records) else []) + (["extra_target_count"] if any(
                      counts[c] > expected[c] for c in counts) else []))),
              "n_candidates": len(proposals), "original_size_hw": original_size,
              "processing_size_hw": list(rgb.shape[:2]), "latency_ms": latency_ms,
              "segmentation_ms": (masks_ready - started) * 1000,
              "model_load_ms": model_load_ms,
              "timing_scope": "inference and postprocessing; excludes model loading, image reading, output writes",
              "classifier_supplied": bundle is not None, "feature_contract": encoder.contract,
              "config": config, "candidates": records,
              "limitation": "Unvalidated prototype; other-class scores do not guarantee rejection of unseen objects."}
    overlay = Image.fromarray(rgb).convert("RGBA")
    layer = Image.new("RGBA", overlay.size)
    draw = ImageDraw.Draw(layer)
    for i, (crop, proposal, record) in enumerate(zip(crops, proposals, records)):
        Image.fromarray(crop).save(output / f"crop_{i:03}.png")
        Image.fromarray(np.uint8(proposal["segmentation"]) * 255).save(output / f"mask_{i:03}.png")
        x0, y0, x1, y1 = record["bbox_xyxy"]
        color = (30, 180, 70, 255) if record["accepted"] else (240, 140, 20, 255)
        draw.rectangle((x0, y0, x1, y1), outline=color, width=3)
        draw.text((x0, max(0, y0 - 12)), f'{i}: {record["label"]}', fill=color)
    Image.alpha_composite(overlay, layer).convert("RGB").save(output / "overlay.jpg")
    np.save(output / "candidate_features.npy", X)
    (output / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    if args.predictions_csv:
        if bundle is None:
            raise ValueError("Do not record untrained outputs as trained-model evaluation")
        csv_path = Path(args.predictions_csv)
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        if csv_path.exists():
            with csv_path.open(encoding="utf-8", newline="") as f:
                if any(row["scene_id"] == result["scene_id"] for row in csv.DictReader(f)):
                    raise ValueError("scene_id already exists in prediction log")
        exists = csv_path.exists() and csv_path.stat().st_size > 0
        with csv_path.open("a", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["scene_id", *counts, "status", "latency_ms"])
            if not exists:
                writer.writeheader()
            writer.writerow({"scene_id": result["scene_id"], **counts, "status": status,
                             "latency_ms": latency_ms})
    print(json.dumps({k: result[k] for k in ["device", "status", "counts", "n_candidates", "latency_ms"]}, indent=2))


if __name__ == "__main__":
    main()
