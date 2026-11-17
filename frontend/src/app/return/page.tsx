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
          화면 확인용 샘플입니다. 사진은 이 기기에서만 보이고 서버로 보내지
          않습니다.
        </p>
      </header>
      <ReturnFlow />
    </div>
  );
}
