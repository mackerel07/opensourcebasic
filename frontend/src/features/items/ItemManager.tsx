"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  NAME_MAX_LENGTH,
  QUANTITY_MAX,
  QUANTITY_MIN,
  addItem,
  resetToSample,
  updateItem,
  useItems,
  useInventory,
  validateItem,
  type Item,
} from "./itemStore";
import styles from "./ItemManager.module.css";

export function ItemManager() {
  const inventory = useInventory();
  return <GroupItemManager key={inventory.groupId} />;
}

function GroupItemManager() {
  const items = useItems();
  const inventory = useInventory();
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  const editingItem = items.find((item) => item.id === editingId) ?? null;

  function clearForm() {
    setEditingId(null);
    setName("");
    setQuantity("1");
    setError(null);
  }

  function startEdit(item: Item) {
    setEditingId(item.id);
    setName(item.name);
    setQuantity(String(item.quantity));
    setError(null);
    setMessage(`“${item.name}” 수정 중`);
    nameRef.current?.focus();
    nameRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function changeQuantity(delta: number) {
    const current = Number.parseInt(quantity, 10);
    const base = Number.isNaN(current) ? QUANTITY_MIN : current;
    const next = Math.min(QUANTITY_MAX, Math.max(QUANTITY_MIN, base + delta));
    setQuantity(String(next));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { name, quantity: Number(quantity) };
    const problem = validateItem(input, items, editingId);
    if (problem) {
      setError(problem);
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      if (editingId) await updateItem(editingId, input);
      else await addItem(input);
      setMessage("Supabase에 저장했어요.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "저장 실패");
      return;
    } finally { setSaving(false); }
    clearForm();
  }

  async function handleReset() {
    if (!window.confirm("이 그룹의 계산기·가위·마우스 수량을 각각 1개로 저장할까요?")) return;
    setSaving(true);
    try {
      await resetToSample();
      clearForm();
      setMessage("세 품목을 각각 1개로 저장했어요.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "저장 실패");
    } finally { setSaving(false); }
  }

  if (!inventory.email || !inventory.groupId) return <p>위에서 로그인하고 물품 그룹을 선택해 주세요.</p>;
  if (inventory.loading) return <p>그룹 물품을 불러오고 있어요.</p>;

  return (
    <div className={styles.wrap}>
      <form
        className={styles.form}
        onSubmit={handleSubmit}
        aria-labelledby="item-form-title"
        aria-busy={saving}
        noValidate
      >
        <h2 id="item-form-title">
          {editingItem ? "물품 수정" : "새 물품 등록"}
        </h2>

        <div className="field">
          <label htmlFor="item-name">물품 이름</label>
          <input
            id="item-name"
            ref={nameRef}
            className="input"
            value={name}
            maxLength={NAME_MAX_LENGTH}
            placeholder="예: 우산"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "item-error" : undefined}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="item-quantity">수량</label>
          <div className={styles.stepper}>
            <button
              type="button"
              className="btn"
              aria-label="수량 1 줄이기"
              onClick={() => changeQuantity(-1)}
            >
              −
            </button>
            <input
              id="item-quantity"
              className="input"
              type="number"
              inputMode="numeric"
              min={QUANTITY_MIN}
              max={QUANTITY_MAX}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              aria-label="수량 1 늘리기"
              onClick={() => changeQuantity(1)}
            >
              +
            </button>
          </div>
        </div>

        {error && (
          <p id="item-error" className="error" role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {editingItem ? "수정 저장" : "등록"}
          </button>
          {editingItem && (
            <button type="button" className="btn" onClick={clearForm}>
              취소
            </button>
          )}
        </div>
      </form>

      <p className="sr-only" aria-live="polite">
        {message}
      </p>
      {message && (
        <p className={styles.toast} aria-hidden="true">
          {message}
        </p>
      )}

      <section aria-labelledby="item-list-title">
        <div className={styles.listHead}>
          <h2 id="item-list-title">물품 목록</h2>
          <span className={styles.count}>{items.length}종</span>
        </div>

        {items.length === 0 ? (
          <p className={styles.empty}>등록된 물품이 없어요.</p>
        ) : (
          <ul className={styles.list}>
            {items.map((item) => (
              <li
                key={item.id}
                className={
                  item.id === editingId
                    ? `${styles.row} ${styles.rowEditing}`
                    : styles.row
                }
              >
                <div className={styles.rowText}>
                  <span className={styles.name}>{item.name}</span>
                  <span className={styles.qty}>{item.quantity}개</span>
                </div>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={saving}
                  onClick={() => startEdit(item)}
                  aria-label={`${item.name} 수정`}
                >
                  수정
                </button>
              </li>
            ))}
          </ul>
        )}

        <button type="button" className={styles.reset} onClick={handleReset} disabled={saving}>
          기본 세 품목 저장
        </button>
      </section>
    </div>
  );
}
