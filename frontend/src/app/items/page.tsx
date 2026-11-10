import type { Metadata } from "next";
import { ItemManager } from "@/features/items/ItemManager";
import styles from "../page-layout.module.css";

export const metadata: Metadata = {
  title: "물품 관리 · 공용 물품 반납 확인",
};

export default function ItemsPage() {
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>물품 관리</h1>
        <p className="hint">
          임시 데이터 · 이 브라우저에만 저장되며 서버로 보내지 않습니다.
        </p>
      </header>
      <ItemManager />
    </div>
  );
}
