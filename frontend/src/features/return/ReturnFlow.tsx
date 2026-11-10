"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useItems } from "@/features/items/itemStore";
import { QuantityStepper } from "./QuantityStepper";
import { ResultPhoto } from "./ResultPhoto";
import {
  SAMPLE_DELAY_MS,
  makeSampleResult,
  missingCount,
  type ReturnRequest,
  type SampleResult,
} from "./sampleAnalysis";
import styles from "./ReturnFlow.module.css";

type Step = "select" | "photo" | "analyzing" | "error" | "result" | "done";
type Photo = { url: string; name: string };

const SAMPLE_LABEL = "샘플 결과 · 실제 AI 분석 아님";

const STEP_LABELS = ["물품 선택", "사진", "결과 확인"];
function stepIndex(step: Step) {
  if (step === "select") return 0;
  if (step === "photo" || step === "analyzing" || step === "error") return 1;
  return 2;
}

export function ReturnFlow() {
  const items = useItems();
  const [step, setStep] = useState<Step>("select");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [result, setResult] = useState<SampleResult | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, number>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const photoUrlRef = useRef<string | null>(null);

  const requests: ReturnRequest[] = items
    .filter((item) => (selected[item.id] ?? 0) > 0)
    .map((item) => ({
      itemId: item.id,
      name: item.name,
      requested: selected[item.id],
    }));

  // 단계가 바뀌면 화면 맨 위 제목으로 초점을 옮긴다(키보드·화면낭독기 사용자용).
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  // 샘플 분석: 일정 시간 "분석 중"을 보여준 뒤 샘플 결과 또는 실패를 보여준다.
  useEffect(() => {
    if (step !== "analyzing") return;
    const timer = window.setTimeout(() => {
      if (simulateFailure) {
        setStep("error");
        return;
      }
      const sample = makeSampleResult(requests);
      setResult(sample);
      setConfirmed(
        Object.fromEntries(sample.rows.map((r) => [r.itemId, r.estimated])),
      );
      setStep("result");
    }, SAMPLE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // requests는 분석 시작 시점의 선택으로 고정한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, simulateFailure]);

  // 화면을 떠날 때 사진 미리보기 주소를 정리한다.
  useEffect(() => {
    return () => {
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    };
  }, []);

  function toggleItem(itemId: string, checked: boolean) {
    setSelected((prev) => ({ ...prev, [itemId]: checked ? 1 : 0 }));
  }

  function setRequested(itemId: string, value: number) {
    setSelected((prev) => ({ ...prev, [itemId]: value }));
  }

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("사진 파일만 선택할 수 있어요.");
      return;
    }
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    const url = URL.createObjectURL(file);
    photoUrlRef.current = url;
    setPhoto({ url, name: file.name });
    setPhotoError(null);
  }

  function restart() {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = null;
    setPhoto(null);
    setSelected({});
    setResult(null);
    setConfirmed({});
    setSimulateFailure(false);
    setStep("select");
  }

  const current = stepIndex(step);

  return (
    <div className={styles.flow}>
      <ol className={styles.steps} aria-label="진행 단계">
        {STEP_LABELS.map((label, i) => (
          <li
            key={label}
            className={
              i === current
                ? styles.stepActive
                : i < current
                  ? styles.stepDone
                  : undefined
            }
            aria-current={i === current ? "step" : undefined}
          >
            <span className={styles.stepNum}>{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {step === "select" && (
        <section className={styles.card} aria-labelledby="step-title">
          <h2 id="step-title" ref={headingRef} tabIndex={-1}>
            반납할 물품과 수량을 골라 주세요
          </h2>

          {items.length === 0 ? (
            <p className="hint">
              등록된 물품이 없어요. <Link href="/items">물품 관리</Link>에서
              먼저 등록해 주세요.
            </p>
          ) : (
            <ul className={styles.selectList}>
              {items.map((item) => {
                const value = selected[item.id] ?? 0;
                const checked = value > 0;
                return (
                  <li key={item.id} className={styles.selectRow}>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => toggleItem(item.id, e.target.checked)}
                      />
                      <span>
                        <strong>{item.name}</strong>
                        <span className={styles.muted}>
                          {" "}
                          · 보유 {item.quantity}개
                        </span>
                      </span>
                    </label>
                    {checked && (
                      <QuantityStepper
                        label={`${item.name} 반납 수량`}
                        value={value}
                        min={1}
                        max={item.quantity}
                        onChange={(v) => setRequested(item.id, v)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={requests.length === 0}
              onClick={() => setStep("photo")}
            >
              다음: 사진 찍기
            </button>
          </div>
          {requests.length === 0 && items.length > 0 && (
            <p className="hint">물품을 하나 이상 고르면 다음으로 갈 수 있어요.</p>
          )}
        </section>
      )}

      {(step === "photo" || step === "analyzing" || step === "error") && (
        <section className={styles.card} aria-labelledby="step-title">
          <h2 id="step-title" ref={headingRef} tabIndex={-1}>
            {step === "analyzing"
              ? "사진을 확인하고 있어요"
              : step === "error"
                ? "분석하지 못했어요"
                : "반납할 물품 사진을 찍어 주세요"}
          </h2>

          <p className={styles.summary}>
            {requests.map((r) => `${r.name} ${r.requested}개`).join(", ")}
          </p>

          {photo ? (
            <div className={styles.previewWrap}>
              {/* eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 고른 사진 미리보기 */}
              <img
                src={photo.url}
                alt="선택한 반납 사진 미리보기"
                className={styles.preview}
              />
              {step === "analyzing" && (
                <div className={styles.analyzing} role="status">
                  <span className={styles.spinner} aria-hidden="true" />
                  분석 중… <span className="sample-badge">샘플</span>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.placeholder}>
              물품이 모두 보이게 위에서 한 장 찍어 주세요.
            </div>
          )}

          {step === "error" && (
            <div className={styles.errorBox} role="alert">
              <strong>샘플 실패 상황입니다.</strong> 사진을 다시 찍거나 다시
              시도해 주세요. 결과는 저장되지 않았어요.
            </div>
          )}

          {photoError && (
            <p className="error" role="alert">
              {photoError}
            </p>
          )}

          {step !== "analyzing" && (
            <>
              <div className={styles.photoButtons}>
                <label className="btn">
                  카메라로 촬영
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={handlePhoto}
                  />
                </label>
                <label className="btn">
                  파일에서 선택
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handlePhoto}
                  />
                </label>
              </div>
              {photo && <p className="hint">선택한 사진: {photo.name}</p>}

              <label className={styles.devToggle}>
                <input
                  type="checkbox"
                  checked={simulateFailure}
                  onChange={(e) => setSimulateFailure(e.target.checked)}
                />
                화면 확인용: 분석 실패 상황 보기
              </label>

              <div className={styles.actions}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setStep("select")}
                >
                  이전
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!photo}
                  onClick={() => setStep("analyzing")}
                >
                  {step === "error" ? "다시 시도" : "결과 보기"}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {step === "result" && result && photo && (
        <section className={styles.card} aria-labelledby="step-title">
          <div className={styles.resultHead}>
            <h2 id="step-title" ref={headingRef} tabIndex={-1}>
              결과를 확인해 주세요
            </h2>
            <span className="sample-badge">{SAMPLE_LABEL}</span>
          </div>

          <ResultPhoto
            url={photo.url}
            boxes={result.boxes}
            itemOrder={result.rows.map((r) => r.itemId)}
          />

          <p className="hint">
            사진과 다르면 확인 수량을 고쳐 주세요. 고른 수량보다 적으면
            누락으로 표시돼요.
          </p>

          <ul className={styles.resultList}>
            {result.rows.map((row) => {
              const value = confirmed[row.itemId] ?? 0;
              const missing = missingCount(row.requested, value);
              const over = value > row.requested;
              return (
                <li key={row.itemId} className={styles.resultRow}>
                  <div className={styles.resultInfo}>
                    <strong>{row.name}</strong>
                    <span className={styles.muted}>
                      반납 {row.requested}개 · 예상 {row.estimated}개
                    </span>
                    <span
                      className={
                        missing > 0
                          ? styles.badgeMissing
                          : over
                            ? styles.badgeWarn
                            : styles.badgeOk
                      }
                    >
                      {missing > 0
                        ? `누락 ${missing}개`
                        : over
                          ? "고른 수량보다 많음"
                          : "누락 없음"}
                    </span>
                  </div>
                  <QuantityStepper
                    label={`${row.name} 확인 수량`}
                    value={value}
                    min={0}
                    max={999}
                    onChange={(v) =>
                      setConfirmed((prev) => ({ ...prev, [row.itemId]: v }))
                    }
                  />
                </li>
              );
            })}
          </ul>

          <div className={styles.actions}>
            <button
              type="button"
              className="btn"
              onClick={() => setStep("photo")}
            >
              사진 다시 찍기
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep("done")}
            >
              최종 확인
            </button>
          </div>
        </section>
      )}

      {step === "done" && result && (
        <section className={styles.card} aria-labelledby="step-title">
          <div className={styles.resultHead}>
            <h2 id="step-title" ref={headingRef} tabIndex={-1}>
              반납 확인을 마쳤어요
            </h2>
            <span className="sample-badge">{SAMPLE_LABEL}</span>
          </div>

          <ul className={styles.doneList}>
            {result.rows.map((row) => {
              const value = confirmed[row.itemId] ?? 0;
              const missing = missingCount(row.requested, value);
              return (
                <li key={row.itemId}>
                  <span>
                    <strong>{row.name}</strong> 확인 {value}개 / 반납{" "}
                    {row.requested}개
                  </span>
                  <span
                    className={missing > 0 ? styles.badgeMissing : styles.badgeOk}
                  >
                    {missing > 0 ? `누락 ${missing}개` : "누락 없음"}
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="hint">
            화면 확인용 결과라서 서버에 저장되지 않았어요.
          </p>

          <div className={styles.actions}>
            <button type="button" className="btn btn-primary" onClick={restart}>
              새 반납 확인
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
