"use client";

import { useSyncExternalStore } from "react";

/**
 * 화면 확인용 임시 물품 데이터.
 * 실제 DB·API 명세가 아니며, 저장소 소유자 검토 후 서버 연결로 바꾼다.
 * (docs/REVIEW_GATE.md 참고)
 */
export type Item = {
  id: string;
  name: string;
  quantity: number;
};

export const NAME_MAX_LENGTH = 30;
export const QUANTITY_MIN = 1;
export const QUANTITY_MAX = 999;

const STORAGE_KEY = "osb-sample-items-v1";

const SAMPLE_ITEMS: Item[] = [
  { id: "sample-umbrella", name: "우산", quantity: 5 },
  { id: "sample-battery", name: "보조배터리", quantity: 3 },
  { id: "sample-tripod", name: "삼각대", quantity: 2 },
];

let cache: Item[] | null = null;
const listeners = new Set<() => void>();

function isItem(value: unknown): value is Item {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.quantity === "number" &&
    Number.isInteger(v.quantity)
  );
}

function load(): Item[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return SAMPLE_ITEMS;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(isItem)) return parsed;
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 샘플 데이터로 동작한다.
  }
  return SAMPLE_ITEMS;
}

function getSnapshot(): Item[] {
  if (cache === null) cache = load();
  return cache;
}

function getServerSnapshot(): Item[] {
  return SAMPLE_ITEMS;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function save(next: Item[]) {
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 저장에 실패해도 현재 화면에서는 계속 쓸 수 있게 한다.
  }
  listeners.forEach((listener) => listener());
}

export function useItems(): Item[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export type ItemInput = { name: string; quantity: number };

/** 입력값을 검사하고, 문제가 있으면 사용자에게 보여줄 문장을 돌려준다. */
export function validateItem(
  input: ItemInput,
  items: Item[],
  editingId: string | null,
): string | null {
  const name = input.name.trim();
  if (name.length === 0) return "물품 이름을 입력해 주세요.";
  if (name.length > NAME_MAX_LENGTH)
    return `물품 이름은 ${NAME_MAX_LENGTH}자 이하로 입력해 주세요.`;
  if (!Number.isInteger(input.quantity))
    return "수량은 정수로 입력해 주세요.";
  if (input.quantity < QUANTITY_MIN || input.quantity > QUANTITY_MAX)
    return `수량은 ${QUANTITY_MIN}~${QUANTITY_MAX} 사이로 입력해 주세요.`;
  const duplicate = items.some(
    (item) => item.id !== editingId && item.name === name,
  );
  if (duplicate) return "같은 이름의 물품이 이미 있어요.";
  return null;
}

export function addItem(input: ItemInput): Item {
  const item: Item = {
    id: `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name.trim(),
    quantity: input.quantity,
  };
  save([...getSnapshot(), item]);
  return item;
}

export function updateItem(id: string, input: ItemInput) {
  save(
    getSnapshot().map((item) =>
      item.id === id
        ? { ...item, name: input.name.trim(), quantity: input.quantity }
        : item,
    ),
  );
}

export function resetToSample() {
  save(SAMPLE_ITEMS);
}
