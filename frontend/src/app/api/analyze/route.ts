import { modelLabel } from "@/features/return/modelLabels";

export const maxDuration = 180;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "다른 사이트에서의 요청은 허용하지 않아요." }, { status: 403 });
  }
  const url = process.env.MODEL_SERVER_URL;
  const key = process.env.MODEL_SERVER_API_KEY;
  if (!url || !key) return Response.json({ error: "모델 서버 설정이 필요해요." }, { status: 503 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(length) || length > 4 * 1024 * 1024 + 65536) {
    return Response.json({ error: "사진 크기를 줄여 주세요." }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "사진 요청을 읽지 못했어요." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 4 * 1024 * 1024) {
    return Response.json({ error: "4 MiB 이하 사진을 선택해 주세요." }, { status: 422 });
  }
  const groupId = form.get("group_id");
  let groupItems: { label_code: string; expected_quantity: number }[] | null = null;
  // DB 그룹을 지정한 요청만 소유권을 확인한다. 비회원은 브라우저 목록을 전달한다.
  if (groupId !== null) {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return Response.json({ error: "그룹 접근 권한이 없어요." }, { status: 401 });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !publishableKey) return Response.json({ error: "DB 연결 설정이 필요해요." }, { status: 503 });
    try {
      const auth = await fetch(supabaseUrl + "/auth/v1/user", {
        headers: { Authorization: authorization, apikey: publishableKey },
        signal: AbortSignal.timeout(10000), cache: "no-store",
      });
      if (!auth.ok) return Response.json({ error: "다시 로그인해 주세요." }, { status: 401 });
    } catch {
      return Response.json({ error: "로그인 확인에 실패했어요." }, { status: 503 });
    }
    if (typeof groupId !== "string" || !/^[0-9a-f-]{36}$/i.test(groupId)) {
      return Response.json({ error: "물품 그룹을 선택해 주세요." }, { status: 422 });
    }
    try {
      const response = await fetch(
        supabaseUrl + "/rest/v1/item_group_items?select=label_code,expected_quantity&group_id=eq." + encodeURIComponent(groupId),
        { headers: { Authorization: authorization, apikey: publishableKey },
          signal: AbortSignal.timeout(10000), cache: "no-store" },
      );
      if (!response.ok) throw new Error();
      groupItems = await response.json();
    } catch {
      return Response.json({ error: "그룹 물품을 확인하지 못했어요." }, { status: 503 });
    }
  }
  const expected: Record<string, number> = { calculator: 0, scissors: 0, mouse: 0 };
  try {
    const items: unknown = JSON.parse(String(form.get("items")));
    if (!Array.isArray(items) || items.length < 1 || items.length > 3) throw new Error();
    const seen = new Set<string>();
    for (const item of items) {
      if (!item || typeof item.name !== "string" || typeof item.itemId !== "string") throw new Error();
      const label = modelLabel(item.name);
      if (!label || seen.has(label) || !Number.isInteger(item.requested) || item.requested < 1 || item.requested > 999) {
        throw new Error();
      }
      if (groupItems) {
        const stored = groupItems.find((row) => row.label_code === label);
        if (!stored || item.requested > stored.expected_quantity) throw new Error();
      }
      seen.add(label);
      expected[label] = item.requested;
    }
  } catch {
    return Response.json({ error: "지원하는 물품 종류와 수량을 확인해 주세요." }, { status: 422 });
  }
  const upstream = new FormData();
  upstream.set("file", file);
  upstream.set("expected", JSON.stringify(expected));
  try {
    const response = await fetch(new URL("/predict", url), {
      method: "POST", headers: { "X-Model-API-Key": key, "ngrok-skip-browser-warning": "1" },
      body: upstream, signal: AbortSignal.timeout(135000), cache: "no-store",
    });
    if (!response.ok) {
      const busy = response.status === 503;
      return Response.json({ error: busy ? "모델이 처리 중이에요. 잠시 뒤 다시 시도해 주세요." : "모델 서버가 사진을 처리하지 못했어요." },
        { status: busy ? 503 : 502 });
    }
    const data = await response.json();
    return Response.json({ status: data.status, counts: data.counts, candidates: data.candidates,
      processing_size_hw: data.processing_size_hw }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "모델 서버에 연결하지 못했어요. 서버와 터널을 확인해 주세요." }, { status: 502 });
  }
}
