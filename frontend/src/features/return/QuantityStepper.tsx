"use client";

import styles from "./ReturnFlow.module.css";

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

/** − / + 버튼으로 수량을 바꾸는 작은 입력. */
export function QuantityStepper({ label, value, min, max, onChange }: Props) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  return (
    <div className={styles.stepper} role="group" aria-label={label}>
      <button
        type="button"
        className="btn btn-small"
        aria-label={`${label} 1 줄이기`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
      >
        −
      </button>
      <output aria-live="polite" className={styles.stepperValue}>
        {value}
      </output>
      <button
        type="button"
        className="btn btn-small"
        aria-label={`${label} 1 늘리기`}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        +
      </button>
    </div>
  );
}
