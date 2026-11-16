"use client";

import type { ReactNode } from "react";
import type { Photo } from "./loadPhoto";
import styles from "./ReturnFlow.module.css";

/** 사진이 차지할 수 있는 최대 높이(화면 높이 대비) */
const MAX_HEIGHT = "60vh";

type Props = {
  photo: Photo;
  alt: string;
  /** 사진 위에 겹쳐 그릴 내용. 위치(%)는 실제 사진 영역 기준이다. */
  children?: ReactNode;
};

/**
 * 사진 비율 그대로, 사진 크기에 딱 맞는 틀을 만든다.
 * 틀과 사진의 크기가 같으므로 안쪽 요소의 %, 좌표가 사진 경계를 벗어나지 않는다.
 */
export function PhotoFrame({ photo, alt, children }: Props) {
  const ratio = photo.width / photo.height;

  return (
    <div className={styles.photoStage}>
      <div
        className={styles.photoFrame}
        style={{
          aspectRatio: `${photo.width} / ${photo.height}`,
          width: `min(100%, calc(${MAX_HEIGHT} * ${ratio}))`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 고른 사진 */}
        <img src={photo.url} alt={alt} className={styles.photoImg} />
        {children}
      </div>
    </div>
  );
}
