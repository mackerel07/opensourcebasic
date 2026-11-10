"""Report versions and check an actual accelerator operation."""
import json
import platform
import sys
from importlib.metadata import version
from pathlib import Path

from vision_runtime import choose_device, read_runtime
import torch

result = {
    "python": sys.version.split()[0], "os": platform.platform(), "machine": platform.machine(),
    "packages": {n: version(n) for n in ["torch", "torchvision", "scikit-learn", "numpy", "scipy", "Pillow", "SAM-2"]},
    "mps_available": torch.backends.mps.is_available(), "cuda_available": torch.cuda.is_available(),
    "selected_device": choose_device(),
}
result["tensor_operation"] = (torch.tensor([1., 2.], device=result["selected_device"]) ** 2).sum().item()
if Path("runtime.local.json").exists():
    config = read_runtime("runtime.local.json")
    result["runtime_paths_exist"] = {k: Path(config[k]).exists() for k in [
        "sam2_repo", "dino_repo", "sam2_checkpoint", "dino_checkpoint"]}
print(json.dumps(result, indent=2))
