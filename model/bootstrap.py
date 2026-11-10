"""Fetch pinned official repositories/weights and configure the current machine."""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPOS = {
    "sam2": ("https://github.com/facebookresearch/sam2.git", "2b90b9f5ceec907a1c18123530e92e794ad901a4"),
    "dinov2": ("https://github.com/facebookresearch/dinov2.git", "7764ea0f912e53c92e82eb78a2a1631e92725fc8"),
}
WEIGHTS = {
    "sam2.1_hiera_small.pt": "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_small.pt",
    "dinov2_vits14_pretrain.pth": "https://dl.fbaipublicfiles.com/dinov2/dinov2_vits14/dinov2_vits14_pretrain.pth",
}


def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for b in iter(lambda: f.read(1024 * 1024), b""):
            h.update(b)
    return h.hexdigest()


def repo(path, name):
    url, revision = REPOS[name]
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "--depth", "1", url, str(path)], check=True)
        if subprocess.check_output(["git", "-C", str(path), "rev-parse", "HEAD"], text=True).strip() != revision:
            subprocess.run(["git", "-C", str(path), "fetch", "--depth", "1", "origin", revision], check=True)
            subprocess.run(["git", "-C", str(path), "checkout", "--detach", revision], check=True)
    actual = subprocess.check_output(["git", "-C", str(path), "rev-parse", "HEAD"], text=True).strip()
    if actual != revision:
        raise RuntimeError(f"Existing {path} is at {actual}, expected {revision}; use a new empty destination")
    changes = subprocess.check_output(["git", "-C", str(path), "status", "--porcelain", "--untracked-files=no"], text=True)
    if changes.strip():
        raise RuntimeError(f"Tracked source changes in {path}; use a clean checkout")


def download(url, destination):
    if not destination.exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        partial = destination.with_suffix(destination.suffix + ".part")
        print("Downloading", destination.name, flush=True)
        with urllib.request.urlopen(url, timeout=90) as response, partial.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        partial.replace(destination)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--sam2-repo", type=Path, default=ROOT / "vendor/sam2")
    p.add_argument("--dino-repo", type=Path, default=ROOT / "vendor/dinov2")
    p.add_argument("--checkpoints", type=Path, default=ROOT / "checkpoints")
    p.add_argument("--runtime", type=Path, default=ROOT / "runtime.local.json")
    p.add_argument("--skip-install", action="store_true")
    p.add_argument("--sample", action="store_true")
    args = p.parse_args()
    for path, name in [(args.sam2_repo, "sam2"), (args.dino_repo, "dinov2")]:
        repo(path.resolve(), name)
    known = ROOT / "checkpoint_hashes.json"
    expected = json.loads(known.read_text()) if known.exists() else {}
    actual = {}
    for name, url in WEIGHTS.items():
        target = (args.checkpoints / name).resolve()
        download(url, target)
        actual[name] = digest(target)
        if name in expected and expected[name] != actual[name]:
            raise RuntimeError(f"Checkpoint checksum mismatch: {target}")
    if not args.skip_install:
        env = dict(os.environ, SAM2_BUILD_CUDA="0")
        subprocess.run([sys.executable, "-m", "pip", "install", "--no-build-isolation",
                        "--no-deps", "-e", str(args.sam2_repo.resolve())], check=True, env=env)
    config = {"python_executable": sys.executable,
              "sam2_repo": str(args.sam2_repo.resolve()),
              "dino_repo": str(args.dino_repo.resolve()),
              "sam2_checkpoint": str((args.checkpoints / "sam2.1_hiera_small.pt").resolve()),
              "dino_checkpoint": str((args.checkpoints / "dinov2_vits14_pretrain.pth").resolve()),
              "source_revisions": {name: values[1] for name, values in REPOS.items()},
              "checkpoint_sha256": actual}
    args.runtime.write_text(json.dumps(config, indent=2), encoding="utf-8")
    if args.sample:
        download("https://raw.githubusercontent.com/facebookresearch/sam2/" +
                 REPOS["sam2"][1] + "/notebooks/images/truck.jpg", ROOT / "sample/truck.jpg")
    print("Configured", args.runtime)


if __name__ == "__main__":
    main()
