/**
 * 화면 확인용 "샘플" 분석 결과를 만든다.
 * 실제 AI 분석이 아니며, 서버·모델 API 명세도 아니다.
 * 실제 연결은 저장소 소유자 검토(docs/REVIEW_GATE.md) 후 이 부분을 바꾼다.
 */

export type ReturnRequest = {
  itemId: string;
  name: string;
  /** 사용자가 반납한다고 고른 수량 */
  requested: number;
};

/** 사진 위 위치. 사진 크기에 대한 비율(0~100%) */
export type Box = {
  itemId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ResultRow = {
  itemId: string;
  name: string;
  requested: number;
  /** 샘플 분석이 예상한 수량 */
  estimated: number;
};

export type SampleResult = {
  rows: ResultRow[];
  boxes: Box[];
};

export const SAMPLE_DELAY_MS = 1500;

/**
 * 누락 표시를 확인할 수 있도록 마지막 물품은 1개 적게 찾은 것으로 만든다.
 * 위치 상자는 사진 위에 겹치지 않게 격자로 배치한다.
 */
export function makeSampleResult(requests: ReturnRequest[]): SampleResult {
  const rows: ResultRow[] = requests.map((req, index) => {
    const isLast = index === requests.length - 1;
    const estimated = isLast ? Math.max(0, req.requested - 1) : req.requested;
    return { ...req, estimated };
  });

  const units = rows.flatMap((row) =>
    Array.from({ length: row.estimated }, () => ({
      itemId: row.itemId,
      name: row.name,
    })),
  );

  const columns = Math.max(1, Math.ceil(Math.sqrt(units.length)));
  const rowsCount = Math.max(1, Math.ceil(units.length / columns));
  const cellW = 100 / columns;
  const cellH = 100 / rowsCount;

  const boxes: Box[] = units.map((unit, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    return {
      ...unit,
      x: col * cellW + cellW * 0.12,
      y: row * cellH + cellH * 0.14,
      width: cellW * 0.76,
      height: cellH * 0.72,
    };
  });

  return { rows, boxes };
}

/** 확인 수량이 반납하려던 수량보다 적으면 누락이다. */
export function missingCount(requested: number, confirmed: number): number {
  return Math.max(0, requested - confirmed);
}
