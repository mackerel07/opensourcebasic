import Link from "next/link";
import styles from "./home.module.css";

export default function HomePage() {
  return (
    <div className={styles.page}>
      <section className={styles.intro}>
        <h1>공용 물품 반납 확인</h1>
        <p>
          공용 물품을 등록해 두고, 반납할 때 휴대폰 사진으로 물품과 수량을
          확인합니다.
        </p>
      </section>

      <div className={styles.cards}>
        <Link href="/items" className={styles.card}>
          <span className={styles.step}>1</span>
          <h2>물품 관리</h2>
          <p>공용 물품의 이름과 수량을 등록하고 수정합니다.</p>
        </Link>
        <Link href="/return" className={styles.card}>
          <span className={styles.step}>2</span>
          <h2>반납 확인</h2>
          <p>반납할 물품을 고르고 사진을 찍어 결과를 확인합니다.</p>
        </Link>
      </div>

      <p className="hint">
        지금은 화면 확인용 임시 데이터로 동작합니다. 입력한 내용은 이
        브라우저에만 저장되고 서버로 보내지 않습니다.
      </p>
    </div>
  );
}
