"""Recreate reviewed SAM2 box/point prompts for training-image annotation."""
import argparse
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor

from vision_runtime import choose_device, load_rgb, masked_crop, read_runtime


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", required=True, type=Path)
    parser.add_argument("--annotations", required=True, type=Path)
    parser.add_argument("--outdir", required=True, type=Path)
    parser.add_argument("--runtime", default="runtime.local.json")
    args = parser.parse_args()
    annotations = json.loads(args.annotations.read_text())
    device = choose_device("cpu")
    runtime = read_runtime(args.runtime)
    sam = build_sam2("configs/sam2.1/sam2.1_hiera_s.yaml", runtime["sam2_checkpoint"],
                     device=device, apply_postprocessing=False)
    predictor = SAM2ImagePredictor(sam)
    for name, annotation in annotations.items():
        source = Path(name)
        if source.is_absolute() or ".." in source.parts or source.parts[0] != "single":
            raise ValueError(f"Expected a single-image relative path: {source}")
        folder = args.outdir / source.stem
        folder.mkdir(parents=True, exist_ok=True)
        if any(folder.glob("crop_100*.png")):
            raise FileExistsError(f"Prompted candidates already exist in {folder}")
        rgb = load_rgb(args.dataset_root / source)
        height, width = rgb.shape[:2]
        scale = 1024 / max(height, width)
        rgb = np.asarray(Image.fromarray(rgb).resize(
            (round(width * scale), round(height * scale)))).copy()
        with torch.inference_mode():
            predictor.set_image(rgb)
            masks, scores, _ = predictor.predict(
                point_coords=np.array(annotation["positive_points"]),
                point_labels=np.ones(len(annotation["positive_points"])),
                box=np.array(annotation["box"]), multimask_output=True,
            )
        for index, mask in enumerate(masks, start=1000):
            crop, _ = masked_crop(rgb, mask)
            Image.fromarray(crop).save(folder / f"crop_{index}.png")
            Image.fromarray(mask.astype(np.uint8) * 255).save(folder / f"mask_{index}.png")
        (folder / "repair.json").write_text(json.dumps(dict(annotation, scores=scores.tolist())))
        print(f"{source.stem}: {len(masks)} prompted candidates")


if __name__ == "__main__":
    main()
