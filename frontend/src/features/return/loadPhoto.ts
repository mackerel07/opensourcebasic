/** 화면에 쓸 수 있는지 확인을 마친 사진 */
export type Photo = {
  url: string;
  name: string;
  /** 실제 사진의 가로·세로 픽셀 수 */
  width: number;
  height: number;
};

/**
 * 사진을 실제로 열어(디코딩해) 본다.
 * MIME 타입이 image/*여도 내용이 손상되면 실패한다.
 */
export async function decodePhoto(
  url: string,
): Promise<{ width: number; height: number }> {
  const img = new Image();
  img.src = url;
  await img.decode();
  if (img.naturalWidth === 0 || img.naturalHeight === 0) {
    throw new Error("사진 크기를 읽을 수 없음");
  }
  return { width: img.naturalWidth, height: img.naturalHeight };
}
