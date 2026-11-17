import type { Metadata } from "next";
import { ReturnFlow } from "@/features/return/ReturnFlow";
import styles from "../page-layout.module.css";

export const metadata: Metadata = {
  title: "반납 확인 · 공용 물품 반납 확인",
};

export default function ReturnPage() {
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>반납 확인</h1>
        <p className="hint">
          선택한 사진을 모델 서버로 보내 분석합니다. 결과 수량을 직접 확인해 주세요.
        </p>
      </header>
      <ReturnFlow />
    </div>
  );
}
