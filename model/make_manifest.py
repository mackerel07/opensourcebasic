"""Index prepared crops under source/split/class/group__filename.png.

Split assignment is deliberate: this command never randomly splits consecutive
photos or related crops. Human checks of labels and group IDs are still needed.
"""
import argparse
import csv
from pathlib import Path

from train_head import CLASSES, read_manifest


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--root", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    args = p.parse_args()
    root, output = args.root.resolve(), args.output.resolve()
    rows = []
    for image in sorted(root.rglob("*")):
        if not image.is_file() or image.suffix.lower() not in {".png", ".jpg", ".jpeg"}:
            continue
        parts = image.relative_to(root).parts
        if len(parts) != 4:
            raise ValueError(f"Expected source/split/class/filename: {image}")
        source, split, label, name = parts
        if split not in {"train", "val", "test"} or label not in CLASSES:
            raise ValueError(f"Invalid split/class: {image}")
        if "__" not in name:
            raise ValueError(f"Use group__filename naming so related images share a group: {image}")
        group = name.split("__", 1)[0]
        if not group:
            raise ValueError("group prefix cannot be empty")
        import os
        rows.append({"path": os.path.relpath(image, output.parent), "label": label,
                     "split": split, "group": f"{source}/{group}", "source": source})
    if not rows:
        raise ValueError("No crop images found")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".candidate")
    with temporary.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["path", "label", "split", "group", "source"])
        writer.writeheader()
        writer.writerows(rows)
    try:
        read_manifest(temporary)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    temporary.replace(output)
    print(f"Wrote {len(rows)} images to {output}")


if __name__ == "__main__":
    main()
