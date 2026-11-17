export type ReturnRequest = { itemId: string; name: string; requested: number };
export type Box = { itemId: string; name: string; x: number; y: number; width: number; height: number };
export type ModelResult = {
  rows: (ReturnRequest & { estimated: number })[];
  boxes: Box[];
  status: "complete" | "missing" | "review";
};
export type ModelResponse = {
  status: ModelResult["status"];
  counts: Record<string, number>;
  processing_size_hw: [number, number];
  candidates: { label: string; accepted: boolean; bbox_xyxy: [number, number, number, number] }[];
};

const LABELS: Record<string, string> = {
  계산기: "calculator", 가위: "scissors", 마우스: "mouse", "컴퓨터 마우스": "mouse",
  calculator: "calculator", scissors: "scissors", mouse: "mouse",
};
export function modelLabel(name: string): string | undefined {
  const key = name.trim().toLowerCase();
  return Object.hasOwn(LABELS, key) ? LABELS[key] : undefined;
}
export function missingCount(requested: number, confirmed: number) {
  return Math.max(0, requested - confirmed);
}

export async function analyzePhoto(url: string, items: ReturnRequest[], signal: AbortSignal): Promise<ModelResult> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("사진을 준비하지 못했어요.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("사진 변환 실패")), "image/jpeg", 0.9);
  });
  const form = new FormData();
  form.set("file", blob, "return.jpg");
  form.set("items", JSON.stringify(items));
  const response = await fetch("/api/analyze", { method: "POST", body: form, signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "모델 서버 연결에 실패했어요.");
  const result = data as ModelResponse;
  const [height, width] = result.processing_size_hw;
  return {
    status: result.status,
    rows: items.map((item) => ({ ...item, estimated: result.counts[modelLabel(item.name)!] ?? 0 })),
    boxes: result.candidates.filter((candidate) => candidate.accepted).flatMap((candidate) => {
      const item = items.find((entry) => modelLabel(entry.name) === candidate.label);
      if (!item) return [];
      const [x0, y0, x1, y1] = candidate.bbox_xyxy;
      return [{ itemId: item.itemId, name: item.name, x: 100 * x0 / width, y: 100 * y0 / height,
        width: 100 * (x1 - x0) / width, height: 100 * (y1 - y0) / height }];
    }),
  };
}
