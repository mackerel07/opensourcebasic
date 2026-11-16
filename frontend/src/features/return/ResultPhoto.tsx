"use client";

import type { Photo } from "./loadPhoto";
import { PhotoFrame } from "./PhotoFrame";
import type { Box } from "./sampleAnalysis";
import styles from "./ReturnFlow.module.css";

const COLORS = ["#2f8f5f", "#c05621", "#2b6cb0", "#9b2c9b", "#b7791f", "#2c7a7b"];

type Props = {
  photo: Photo;
  boxes: Box[];
  /** 물품마다 같은 색을 쓰기 위한 순서 */
  itemOrder: string[];
};

/** 사진 위에 물품 위치(샘플)를 상자로 표시한다. 상자 위치는 실제 사진 영역 기준이다. */
export function ResultPhoto({ photo, boxes, itemOrder }: Props) {
  const colorOf = (itemId: string) =>
    COLORS[Math.max(0, itemOrder.indexOf(itemId)) % COLORS.length];

  return (
    <figure className={styles.resultFigure}>
      <PhotoFrame photo={photo} alt="반납 사진">
        {boxes.map((box, i) => (
          <div
            key={`${box.itemId}-${i}`}
            className={styles.box}
            style={{
              left: `${box.x}%`,
              top: `${box.y}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
              borderColor: colorOf(box.itemId),
            }}
            aria-hidden="true"
          >
            <span
              className={styles.boxLabel}
              style={{ background: colorOf(box.itemId) }}
            >
              {box.name}
            </span>
          </div>
        ))}
      </PhotoFrame>
      <figcaption className="hint">
        상자는 샘플 위치예요. 사진 속 실제 물품 위치와 다를 수 있어요.
        {boxes.length === 0 && " 찾은 물품이 없어요."}
      </figcaption>
    </figure>
  );
}
