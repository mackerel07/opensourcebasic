"""Frozen DINOv2 features -> regularized multinomial logistic regression.

Input crops must already contain the intended object or an explicitly labelled
negative region. This script does not select SAM2 masks or count objects.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path

CLASSES = ["calculator", "scissors", "mouse", "other"]


def read_manifest(path):
    path = Path(path).resolve()
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        needed = {"path", "label", "split", "group", "source"}
        if not needed.issubset(reader.fieldnames or []):
            raise ValueError("CSV needs path,label,split,group,source")
        rows = list(reader)
    if not rows:
        raise ValueError("Manifest is empty")
    group_split, digest_split = {}, {}
    for row in rows:
        if row["label"] not in CLASSES or row["split"] not in {"train", "val", "test"}:
            raise ValueError(f"Invalid label or split: {row}")
        if not row["group"].strip() or not row["source"].strip():
            raise ValueError("group and source cannot be empty")
        # All crops/augmentations from one original image or capture group must
        # keep the same group ID. Near duplicates still need manual inspection.
        old = group_split.setdefault(row["group"], row["split"])
        if old != row["split"]:
            raise ValueError(f"Group leaks across splits: {row['group']}")
        image_path = (path.parent / row["path"]).resolve()
        if not image_path.is_file():
            raise FileNotFoundError(image_path)
        digest = hashlib.sha256(image_path.read_bytes()).hexdigest()
        previous = digest_split.setdefault(digest, row["split"])
        if previous != row["split"]:
            raise ValueError(f"Identical image bytes cross splits: {image_path}")
        row["absolute_path"] = str(image_path)
    return rows


def extract(args):
    import numpy as np
    from vision_runtime import DinoEncoder, load_rgb, read_runtime

    rows = read_manifest(args.manifest)
    if args.batch_size < 1:
        raise ValueError("batch-size must be positive")
    runtime = read_runtime(args.runtime)
    encoder = DinoEncoder(runtime["dino_repo"], runtime["dino_checkpoint"], args.device)
    features = []
    for start in range(0, len(rows), args.batch_size):
        batch_rows = rows[start:start + args.batch_size]
        features.append(encoder.encode([load_rgb(r["absolute_path"]) for r in batch_rows], args.batch_size))
        print(f"features {start + len(batch_rows)}/{len(rows)} on {encoder.device}")
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(output, X=np.concatenate(features),
                        y=np.array([r["label"] for r in rows]),
                        split=np.array([r["split"] for r in rows]),
                        source=np.array([r["source"] for r in rows]),
                        group=np.array([r["group"] for r in rows]),
                        path=np.array([r["path"] for r in rows]),
                        contract=json.dumps(encoder.contract, sort_keys=True))
    output.with_suffix(".metadata.json").write_text(json.dumps({
        "backbone": "dinov2_vits14", "features": 384,
        "preprocess": "RGB; aspect-preserving pad to 224x224; gray 127; ImageNet normalization",
        "manifest_sha256": hashlib.sha256(Path(args.manifest).read_bytes()).hexdigest(),
        "contract": encoder.contract, "device": encoder.device,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(output)


def fit(args):
    import joblib
    import numpy as np
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import accuracy_score, f1_score
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import Normalizer

    data = np.load(args.features, allow_pickle=False)
    X, y, split = data["X"], data["y"], data["split"]
    if X.shape != (len(y), 384) or not np.isfinite(X).all():
        raise ValueError("Expected finite N x 384 features")
    groups = {}
    for group, part in zip(data["group"], split):
        if groups.setdefault(str(group), str(part)) != str(part):
            raise ValueError("Group leakage in feature file")
    train, val = split == "train", split == "val"
    if args.selection_source:
        val = val & (data["source"] == args.selection_source)
    for name, selected in [("train", train), ("val", val)]:
        if set(y[selected]) != set(CLASSES):
            raise ValueError(f"{name} must contain all four classes; got {set(y[selected])}")
    scores, best = [], None
    for C in [0.1, 1.0, 10.0, 100.0]:
        estimator = make_pipeline(Normalizer(norm="l2"), LogisticRegression(
            C=C, solver="lbfgs", max_iter=2000, tol=1e-4,
            class_weight="balanced", random_state=42,
        ))
        estimator.fit(X[train], y[train])
        prediction = estimator.predict(X[val])
        score = f1_score(y[val], prediction, labels=CLASSES, average="macro", zero_division=0)
        record = {"C": C, "val_macro_f1": float(score),
                  "val_accuracy": float(accuracy_score(y[val], prediction))}
        scores.append(record)
        print(record)
        # Ties keep the smaller C (stronger regularization).
        if best is None or score > best[0]:
            best = (score, estimator, C)
    output = Path(args.outdir)
    output.mkdir(parents=True, exist_ok=True)
    joblib.dump({"estimator": best[1], "contract": json.loads(str(data["contract"])),
                 "classes": CLASSES}, output / "head.joblib")
    (output / "selection.json").write_text(json.dumps({
        "classes": CLASSES, "selected_C": best[2], "selection": scores,
            "n_train": int(train.sum()), "n_val": int(val.sum()),
        "selection_source": args.selection_source or "all validation sources",
        "refit_on_val": False,
        "note": "No test labels were used for model selection. Thresholds need separate scene validation.",
    }, indent=2), encoding="utf-8")
    print("Saved", output / "head.joblib")


def evaluate(args):
    import joblib
    import numpy as np
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

    data = np.load(args.features, allow_pickle=False)
    chosen = data["split"] == args.split
    if not chosen.any():
        raise ValueError(f"No {args.split} samples")
    # Only load a classifier file you created yourself.
    bundle = joblib.load(args.model)
    if bundle["contract"] != json.loads(str(data["contract"])):
        raise ValueError("Feature preprocessing/checkpoint differs from classifier training")
    estimator = bundle["estimator"]
    X, truth = data["X"][chosen], data["y"][chosen]
    prediction = estimator.predict(X)
    probability = estimator.predict_proba(X)
    labels = list(estimator.classes_)
    output = Path(args.outdir)
    output.mkdir(parents=True, exist_ok=True)
    report = {
        "split": args.split, "n": int(chosen.sum()),
        "accuracy": float(accuracy_score(truth, prediction)),
        "report": classification_report(truth, prediction, labels=CLASSES,
                                         output_dict=True, zero_division=0),
        "confusion_matrix_order": CLASSES,
        "confusion_matrix": confusion_matrix(truth, prediction, labels=CLASSES).tolist(),
        "warning": "These are crop-classification metrics, not automatic return-check accuracy.",
        "by_source": {},
    }
    for source in sorted(set(data["source"][chosen])):
        mask = data["source"][chosen] == source
        supported = [c for c in CLASSES if c in set(truth[mask])]
        report["by_source"][source] = {
            "n": int(mask.sum()), "supported_classes": supported,
            "accuracy": float(accuracy_score(truth[mask], prediction[mask])),
            "macro_f1_supported_classes": float(f1_score(
                truth[mask], prediction[mask], labels=supported,
                average="macro", zero_division=0)),
        }
    (output / "crop_metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from sklearn.metrics import ConfusionMatrixDisplay
    fig, ax = plt.subplots(figsize=(6, 5))
    ConfusionMatrixDisplay.from_predictions(truth, prediction, labels=CLASSES,
                                            ax=ax, cmap="Blues", colorbar=False)
    fig.tight_layout()
    fig.savefig(output / "confusion_matrix.png", dpi=160)
    plt.close(fig)
    with (output / "crop_predictions.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["path", "group", "source", "truth", "prediction", "max_score"] +
                        ["score_" + label for label in labels])
        for i, index in enumerate(np.flatnonzero(chosen)):
            writer.writerow([data["path"][index], data["group"][index],
                             data["source"][index], truth[i], prediction[i],
                             float(probability[i].max()), *probability[i].tolist()])
    print(json.dumps(report, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("extract")
    p.add_argument("--manifest", required=True)
    p.add_argument("--runtime", default="runtime.local.json")
    p.add_argument("--output", required=True)
    p.add_argument("--device", choices=["auto", "cpu", "cuda", "mps"], default="auto")
    p.add_argument("--batch-size", type=int, default=8)
    p.set_defaults(function=extract)
    p = sub.add_parser("fit")
    p.add_argument("--features", required=True)
    p.add_argument("--outdir", required=True)
    p.add_argument("--selection-source", help="For example local: select C on local validation crops only")
    p.set_defaults(function=fit)
    p = sub.add_parser("evaluate")
    p.add_argument("--features", required=True)
    p.add_argument("--model", required=True)
    p.add_argument("--split", choices=["val", "test"], default="test")
    p.add_argument("--outdir", required=True)
    p.set_defaults(function=evaluate)
    args = parser.parse_args()
    args.function(args)


if __name__ == "__main__":
    main()
