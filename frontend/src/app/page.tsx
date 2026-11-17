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
        물품 목록은 로그인한 계정의 그룹에 저장됩니다. 반납 확인에서 선택한 사진은 모델 서버로 전송해 분석합니다.
      </p>
    </div>
  );
}
