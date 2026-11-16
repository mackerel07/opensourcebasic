import type { Metadata } from "next";
import Link from "next/link";
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
          사진 촬영과 결과 확인 화면은 다음 작업(#15)에서 만듭니다.
        </p>
      </header>
      <Link href="/items" className="btn">
        물품 관리로 이동
      </Link>
    </div>
  );
}
