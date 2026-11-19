"""Copy reviewed dataset-v1 candidate crops without changing their data split."""
import argparse
import csv
import hashlib
import shutil
import tempfile
from pathlib import Path

from train_head import CLASSES


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", required=True, type=Path)
    parser.add_argument("--prepared", required=True, type=Path)
    parser.add_argument("--selection", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    with args.selection.open(encoding="utf-8", newline="") as file:
        rows = list(csv.DictReader(file))
    if not rows:
        raise ValueError("Selection is empty")

    group_splits, image_splits, destinations = {}, {}, set()
    entries = []
    for row in rows:
        image = Path(row["image"])
        if image.is_absolute() or ".." in image.parts or image.parts[0] != "single":
            raise ValueError(f"Expected a relative single-image path: {image}")
        label, split, group = row["label"], row["split"], row["group"]
        if label not in CLASSES or split not in {"train", "val"}:
            raise ValueError(f"Invalid label/split: {row}")
        if not group or Path(group).name != group or group in {".", ".."}:
            raise ValueError("Invalid capture group")
        if group_splits.setdefault(group, split) != split:
            raise ValueError(f"Capture group crosses splits: {group}")
        if image_splits.setdefault(str(image), split) != split:
            raise ValueError(f"Original image crosses splits: {image}")
        candidate = int(row["candidate_id"])
        if candidate < 0:
            raise ValueError("Candidate ID must be nonnegative")
        original = args.dataset_root / image
        crop = args.prepared / image.stem / f"crop_{candidate:03d}.png"
        if digest(original) != row["source_sha256"] or digest(crop) != row["crop_sha256"]:
            raise ValueError(f"Reviewed image/crop differs: {image}, candidate {candidate}")
        destination = Path("dataset_v1") / split / label / f"{group}__{image.stem}_c{candidate:03d}.png"
        if destination in destinations:
            raise ValueError(f"Repeated selection: {destination}")
        destinations.add(destination)
        entries.append((crop, destination))

    if args.output.exists():
        raise FileExistsError("Use a new output directory to preserve previous data")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.output.parent) as temporary:
        staged = Path(temporary) / "crops"
        for crop, destination in entries:
            target = staged / destination
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(crop, target)
        staged.rename(args.output)
    print(f"Staged {len(entries)} reviewed crops in {args.output}")


if __name__ == "__main__":
    main()
