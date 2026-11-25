"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { confirmReturn, ReturnSaveError, QUANTITY_MAX, useItems, useInventory } from "@/features/items/itemStore";
import { decodePhoto, type Photo } from "./loadPhoto";
import { PhotoFrame } from "./PhotoFrame";
import { QuantityStepper } from "./QuantityStepper";
import { ResultPhoto } from "./ResultPhoto";
import { analyzePhoto, missingCount, type ReturnRequest, type ModelResult } from "./analysis";
import styles from "./ReturnFlow.module.css";

type Step = "select" | "photo" | "analyzing" | "error" | "result" | "done";

const RESULT_LABEL = "모델 분석 결과 · 수량 직접 확인";

const STEP_LABELS = ["물품 선택", "사진", "결과 확인"];
function stepIndex(step: Step) {
  if (step === "select") return 0;
  if (step === "photo" || step === "analyzing" || step === "error") return 1;
  return 2;
}

export function ReturnFlow() {
  const inventory = useInventory();
  if (!inventory.ready) return <p>물품 목록을 준비하고 있어요.</p>;
  if (!inventory.groupId) return <p>반납할 물품 그룹을 만들어 주세요.</p>;
  if (inventory.loading) return <p>그룹 물품을 불러오고 있어요.</p>;
  return <GroupReturnFlow key={inventory.groupId} />;
}

function GroupReturnFlow() {
  const items = useItems();
  const { groupId } = useInventory();
  const [step, setStep] = useState<Step>("select");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [checkingPhoto, setCheckingPhoto] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<ModelResult | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pendingReturn, setPendingReturn] = useState<{ id: string; counts: Record<string, number> } | null>(null);
  const savingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const photoUrlRef = useRef<string | null>(null);
  /** 사진을 연달아 고를 때, 마지막으로 고른 사진의 확인 결과만 반영하기 위한 번호 */
  const photoLoadRef = useRef(0);

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

  async function runAnalysis() {
    if (!photo) return;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setAnalysisError("");
    setStep("analyzing");
    try {
      const actual = await analyzePhoto(photo.url, requests, controller.signal, groupId);
      if (controller.signal.aborted) return;
      setResult(actual);
      setConfirmed(Object.fromEntries(actual.rows.map((row) => [row.itemId, row.estimated])));
      setStep("result");
    } catch (error) {
      if (controller.signal.aborted) return;
      setAnalysisError(error instanceof Error ? error.message : "분석에 실패했어요.");
      setStep("error");
    }
  }

  // 화면을 떠날 때 사진 미리보기 주소를 정리한다.
  useEffect(() => {
    return () => {
      requestRef.current?.abort();
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    };
  }, []);

  function toggleItem(itemId: string, checked: boolean) {
    setSelected((prev) => ({ ...prev, [itemId]: checked ? 1 : 0 }));
  }

  function setRequested(itemId: string, value: number) {
    setSelected((prev) => ({ ...prev, [itemId]: value }));
  }

  function clearPhoto() {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = null;
    setPhoto(null);
  }

  /**
   * 고른 사진을 실제로 열어 본 뒤에만 사용한다.
   * 열지 못하면(손상된 파일 등) 사진을 비우고 다시 고르라고 안내한다.
   */
  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("사진 파일만 선택할 수 있어요.");
      return;
    }

    const loadId = ++photoLoadRef.current;
    clearPhoto();
    setPhotoError(null);
    setCheckingPhoto(true);

    const url = URL.createObjectURL(file);
    try {
      const size = await decodePhoto(url);
      if (loadId !== photoLoadRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      photoUrlRef.current = url;
      setPhoto({ url, name: file.name, ...size });
    } catch {
      URL.revokeObjectURL(url);
      if (loadId !== photoLoadRef.current) return;
      setPhotoError(
        "사진을 열 수 없어요. 파일이 손상됐을 수 있으니 다른 사진을 찍거나 선택해 주세요.",
      );
    } finally {
      if (loadId === photoLoadRef.current) setCheckingPhoto(false);
    }
  }

  async function finishReturn() {
    if (!result || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    const submission = pendingReturn ?? {
      id: crypto.randomUUID(),
      counts: Object.fromEntries(result.rows.map((row) => [row.itemId, confirmed[row.itemId] ?? 0])),
    };
    setPendingReturn(submission);
    try {
      await confirmReturn(groupId, submission.counts, submission.id);
      setPendingReturn(null);
      setStep("done");
    } catch (error) {
      if (error instanceof ReturnSaveError && error.safeToEdit) setPendingReturn(null);
      setSaveError(error instanceof Error ? error.message : "저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function restart() {
    setSaveError("");
    setPendingReturn(null);
    photoLoadRef.current += 1;
    clearPhoto();
    setCheckingPhoto(false);
    setPhotoError(null);
    setSelected({});
    setResult(null);
    setConfirmed({});
    setAnalysisError("");
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
                        max={QUANTITY_MAX}
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
            <PhotoFrame photo={photo} alt="선택한 반납 사진 미리보기">
              {step === "analyzing" && (
                <div className={styles.analyzing} role="status">
                  <span className={styles.spinner} aria-hidden="true" />
                  모델 분석 중…
                </div>
              )}
            </PhotoFrame>
          ) : (
            <div className={styles.placeholder} aria-live="polite">
              {checkingPhoto
                ? "사진을 확인하고 있어요…"
                : "물품이 모두 보이게 위에서 한 장 찍어 주세요."}
            </div>
          )}

          {step === "error" && (
            <div className={styles.errorBox} role="alert">
              {analysisError}
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
                  disabled={!photo || checkingPhoto}
                  onClick={runAnalysis}
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
            <span className="sample-badge">{RESULT_LABEL}</span>
          </div>

          <ResultPhoto
            photo={photo}
            boxes={result.boxes}
            itemOrder={result.rows.map((r) => r.itemId)}
          />

          {result.status === "review" && (
            <p className="error" role="status">자동 확정이 어려워요. 사진을 보고 각 물품의 수량을 직접 확인해 주세요.</p>
          )}
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
                    disabled={pendingReturn !== null}
                    onChange={(v) =>
                      setConfirmed((prev) => ({ ...prev, [row.itemId]: v }))
                    }
                  />
                </li>
              );
            })}
          </ul>

          <p className="hint">최종 확인하면 확인 수량만큼 공유 재고에 추가해요.</p>
          {saveError && <p className="error" role="alert">{saveError}</p>}
          <div className={styles.actions}>
            <button
              type="button"
              className="btn"
              disabled={pendingReturn !== null}
              onClick={() => setStep("photo")}
            >
              사진 다시 찍기
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={finishReturn}
            >
              {saving ? "재고에 반영 중…" : pendingReturn ? "같은 요청으로 다시 저장" : "최종 확인 · 재고 반영"}
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
            <span className="sample-badge">{RESULT_LABEL}</span>
          </div>

          <ul className={styles.doneList}>
            {result.rows.map((row) => {
              const value = confirmed[row.itemId] ?? 0;
              const missing = missingCount(row.requested, value);
              return (
                <li key={row.itemId}>
                  <span>
                    <strong>{row.name}</strong> 확인 {value}개 / 반납{" "}
                    {row.requested}개 · 현재 재고 {items.find((item) => item.id === row.itemId)?.quantity ?? "—"}개
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
            확인 수량을 공유 재고에 반영했어요.
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
