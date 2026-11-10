"""Shared frozen-backbone preprocessing used during training and inference."""
import hashlib
import json
import os
from pathlib import Path

# Must be set before importing torch. Unsupported MPS operations can use CPU.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import numpy as np
import torch
from PIL import Image, ImageOps
from torchvision import transforms

PREPROCESS = "rgb-exif-pad224-gray127-imagenet-v1"
CLASSES = ["calculator", "scissors", "mouse", "other"]


def sha256(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def choose_device(name="auto"):
    if name == "auto":
        # CPU is the verified Mac reference. SAM2 MPS yielded different masks
        # on the public smoke image; retain MPS only as an explicit experiment.
        name = "cuda" if torch.cuda.is_available() else "cpu"
    if name == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA unavailable")
    if name == "mps" and not torch.backends.mps.is_available():
        raise RuntimeError("MPS unavailable")
    torch.set_num_threads(4)
    return name


def synchronize(device):
    if device == "cuda":
        torch.cuda.synchronize()
    elif device == "mps":
        torch.mps.synchronize()


def load_rgb(path):
    with Image.open(path) as im:
        return np.asarray(ImageOps.exif_transpose(im).convert("RGB")).copy()


def masked_crop(rgb, mask, margin=0.05):
    mask = np.asarray(mask, dtype=bool)
    if mask.shape != rgb.shape[:2] or not mask.any():
        raise ValueError("Mask must match the image and contain at least one pixel")
    y, x = np.where(mask)
    pad = max(1, int(max(x.max() - x.min() + 1, y.max() - y.min() + 1) * margin))
    x0, x1 = max(0, int(x.min()) - pad), min(rgb.shape[1], int(x.max()) + 1 + pad)
    y0, y1 = max(0, int(y.min()) - pad), min(rgb.shape[0], int(y.max()) + 1 + pad)
    crop = rgb[y0:y1, x0:x1].copy()
    crop[~mask[y0:y1, x0:x1]] = 127
    return crop, [x0, y0, x1, y1]


class DinoEncoder:
    def __init__(self, repo, checkpoint, device="auto"):
        self.device = choose_device(device)
        repo, checkpoint = Path(repo).resolve(), Path(checkpoint).resolve()
        if not (repo / "hubconf.py").is_file() or not checkpoint.is_file():
            raise FileNotFoundError("DINOv2 repository or checkpoint missing; run bootstrap.py")
        self.contract = {"backbone": "dinov2_vits14", "features": 384,
                         "preprocess": PREPROCESS, "checkpoint_sha256": sha256(checkpoint)}
        self.model = torch.hub.load(str(repo), "dinov2_vits14", source="local", pretrained=False)
        self.model.load_state_dict(torch.load(checkpoint, map_location="cpu", weights_only=True))
        self.model.to(self.device).eval()
        for parameter in self.model.parameters():
            parameter.requires_grad_(False)
        self.tensorize = transforms.Compose([
            transforms.ToTensor(),
            transforms.Normalize((0.485, 0.456, 0.406), (0.229, 0.224, 0.225)),
        ])

    def encode(self, images, batch_size=8):
        if batch_size < 1:
            raise ValueError("batch_size must be positive")
        if not images:
            return np.empty((0, 384), dtype=np.float32)
        result = []
        with torch.inference_mode():
            for start in range(0, len(images), batch_size):
                tensors = []
                for rgb in images[start:start + batch_size]:
                    image = Image.fromarray(np.asarray(rgb, dtype=np.uint8)).convert("RGB")
                    image = ImageOps.pad(image, (224, 224), method=Image.Resampling.BICUBIC,
                                         color=(127, 127, 127))
                    tensors.append(self.tensorize(image))
                batch = torch.stack(tensors).to(self.device)
                z = self.model(batch).float().cpu().numpy()
                if z.ndim != 2 or z.shape[1] != 384 or not np.isfinite(z).all():
                    raise RuntimeError(f"Invalid feature output: {z.shape}")
                result.append(z)
        return np.concatenate(result)


def read_runtime(filename):
    config_path = Path(filename).resolve()
    config = json.loads(config_path.read_text(encoding="utf-8"))
    for key in ("sam2_repo", "sam2_checkpoint", "dino_repo", "dino_checkpoint"):
        config[key] = str((config_path.parent / config[key]).resolve())
    return config
