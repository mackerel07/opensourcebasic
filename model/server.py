"""Authenticated HTTP adapter for the existing CPU inference CLI."""
import asyncio
import base64
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError

ROOT = Path(__file__).resolve().parent
API_KEY = os.environ["MODEL_SERVER_API_KEY"]
if len(API_KEY) < 32:
    raise RuntimeError("MODEL_SERVER_API_KEY must have at least 32 characters")
RUNTIME = Path(os.environ.get("MODEL_RUNTIME", str(ROOT / "runtime.local.json"))).resolve()
CLASSIFIER = Path(os.environ.get("MODEL_CLASSIFIER", str(ROOT / "runs/dataset_v1/model/head.joblib"))).resolve()
if not RUNTIME.is_file() or not CLASSIFIER.is_file():
    raise RuntimeError("Model runtime or classifier file is missing")
MAX_BYTES = 4 * 1024 * 1024
LABELS = {"calculator", "scissors", "mouse"}
gate = asyncio.Semaphore(1)
app = FastAPI(title="Return check model", docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def authenticate(request, call_next):
    if request.url.path != "/health":
        supplied = request.headers.get("x-model-api-key", "")
        if not secrets.compare_digest(supplied.encode(), API_KEY.encode()):
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        try:
            size = int(request.headers.get("content-length", "0"))
        except ValueError:
            return JSONResponse({"detail": "Invalid content length"}, status_code=400)
        if size > MAX_BYTES + 65536:
            return JSONResponse({"detail": "Upload exceeds 4 MiB"}, status_code=413)
    return await call_next(request)


@app.get("/health")
def health():
    return {"status": "ok"}


def infer(image, expected):
    with tempfile.TemporaryDirectory(prefix="return-inference-") as directory:
        folder = Path(directory)
        source = folder / "input.png"
        source.write_bytes(image)
        config = json.loads((ROOT / "inference_config.json").read_text())
        config["expected"] = expected
        config_path = folder / "config.json"
        config_path.write_text(json.dumps(config))
        output = folder / "result"
        subprocess.run(
            [sys.executable, str(ROOT / "infer_scene.py"), "--image", str(source),
             "--runtime", str(RUNTIME), "--config", str(config_path),
             "--classifier", str(CLASSIFIER), "--device", "cpu", "--outdir", str(output)],
            cwd=ROOT, check=True, timeout=120, stdout=subprocess.DEVNULL,
        )
        result = json.loads((output / "result.json").read_text())
        response = {key: result[key] for key in (
            "status", "counts", "expected", "review_reasons", "n_candidates",
            "original_size_hw", "processing_size_hw", "latency_ms", "candidates",
        )}
        response["overlay_data_url"] = "data:image/jpeg;base64," + base64.b64encode(
            (output / "overlay.jpg").read_bytes()).decode()
        return response


@app.post("/predict")
async def predict(file: UploadFile = File(...), expected: str = Form(...)):
    try:
        counts = json.loads(expected)
        if not isinstance(counts, dict) or set(counts) != LABELS:
            raise ValueError()
        if any(type(value) is not int or not 0 <= value <= 999 for value in counts.values()):
            raise ValueError()
    except (ValueError, TypeError):
        raise HTTPException(422, "expected needs calculator/scissors/mouse integer counts 0..999")
    try:
        image = await file.read(MAX_BYTES + 1)
    finally:
        await file.close()
    if len(image) > MAX_BYTES:
        raise HTTPException(413, "Image exceeds 4 MiB")
    try:
        with Image.open(io.BytesIO(image)) as decoded:
            if decoded.width * decoded.height > 25_000_000:
                raise ValueError("Image exceeds 25 megapixels")
            decoded.verify()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, "Invalid image or image exceeds 25 megapixels")
    if gate.locked():
        raise HTTPException(503, "Model is busy; retry shortly")
    async with gate:
        try:
            return await asyncio.to_thread(infer, image, counts)
        except subprocess.TimeoutExpired:
            raise HTTPException(504, "Inference timed out")
        except subprocess.CalledProcessError:
            raise HTTPException(500, "Inference failed")
