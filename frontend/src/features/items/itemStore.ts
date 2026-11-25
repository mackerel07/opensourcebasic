"use client";

import { useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { modelLabel } from "../return/modelLabels";

export type Item = { id: string; name: string; quantity: number };
export type ItemInput = { name: string; quantity: number };
type Group = { id: string; name: string };
type Inventory = {
  items: Item[];
  groups: Group[];
  groupId: string;
  ready: boolean;
  loading: boolean;
  error: string;
};
export const NAME_MAX_LENGTH = 30;
export const QUANTITY_MIN = 0;
export const QUANTITY_MAX = 999;
const names: Record<string, string> = { calculator: "계산기", scissors: "가위", mouse: "마우스" };
const initial: Inventory = { items: [], groups: [], groupId: "", ready: false, loading: false, error: "" };
let state = initial;
let revision = 0;
const listeners = new Set<() => void>();
function publish(change: Partial<Inventory>) {
  state = { ...state, ...change };
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function useInventory() {
  return useSyncExternalStore(subscribe, () => state, () => initial);
}
export function useItems(): Item[] {
  return useInventory().items;
}

async function readItems(groupId: string) {
  const { data, error } = await supabase().from("shared_item_group_items")
    .select("label_code,expected_quantity").eq("group_id", groupId).order("label_code");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.label_code as string,
    name: names[row.label_code] ?? row.label_code,
    quantity: row.expected_quantity as number,
  }));
}

export async function selectGroup(groupId: string) {
  const current = ++revision;
  publish({ groupId, items: [], loading: true, error: "" });
  try {
    const items = await readItems(groupId);
    if (current === revision) publish({ items, loading: false });
  } catch {
    if (current === revision) publish({ error: "그룹 물품을 읽지 못했어요. 다시 선택해 주세요.", loading: false });
  }
}

export async function loadInventory() {
  const current = ++revision;
  publish({ ...initial, ready: true, loading: true });
  const { data, error } = await supabase().from("shared_item_groups").select("id,name").order("created_at");
  if (current !== revision) return;
  if (error) {
    publish({ error: "공유 목록에 연결하지 못했어요. DB에 공유 목록 SQL이 적용됐는지 확인해 주세요.", loading: false });
    return;
  }
  const groups = (data ?? []) as Group[];
  publish({ groups, loading: false });
  if (groups[0]) await selectGroup(groups[0].id);
}

export async function createGroup(name: string) {
  const current = revision;
  if (!name.trim() || name.trim().length > 100) throw new Error("그룹 이름을 입력해 주세요.");
  const { data, error } = await supabase().from("shared_item_groups")
    .insert({ name: name.trim() }).select("id,name").single();
  if (error || !data) throw new Error("그룹 생성에 실패했어요.");
  if (current !== revision) return;
  publish({ groups: [...state.groups, data as Group] });
  await selectGroup(data.id);
}

export function validateItem(input: ItemInput, items: Item[], editingId: string | null) {
  const code = modelLabel(input.name);
  if (!code) return "물품 이름은 계산기, 가위, 마우스 중에서 입력해 주세요.";
  if (!Number.isInteger(input.quantity) || input.quantity < 0 || input.quantity > 999) {
    return "수량은 0~999 사이 정수로 입력해 주세요.";
  }
  if (items.some((item) => item.id !== editingId && item.id === code)) {
    return "같은 종류의 물품이 이미 있어요.";
  }
  return null;
}

async function saveItem(input: ItemInput, editingId: string | null) {
  const groupId = state.groupId;
  if (!groupId || state.loading) throw new Error("먼저 물품 그룹을 선택해 주세요.");
  const problem = validateItem(input, state.items, editingId);
  if (problem) throw new Error(problem);
  const code = modelLabel(input.name)!;
  const row = { label_code: code, expected_quantity: input.quantity };
  const table = supabase().from("shared_item_group_items");
  const { data, error } = editingId
    ? await table.update(row).eq("group_id", groupId).eq("label_code", editingId).select("label_code")
    : await table.insert({ ...row, group_id: groupId }).select("label_code");
  if (error || !data?.length) throw new Error("저장하지 못했어요. 연결 상태와 그룹을 확인해 주세요.");
  if (state.groupId === groupId) await selectGroup(groupId);
}
export async function addItem(input: ItemInput) {
  await saveItem(input, null);
}
export async function updateItem(id: string, input: ItemInput) {
  await saveItem(input, id);
}
export async function resetToSample() {
  const groupId = state.groupId;
  if (!groupId || state.loading) throw new Error("먼저 물품 그룹을 선택해 주세요.");
  const rows = Object.keys(names).map((code) => ({
    group_id: groupId, label_code: code, expected_quantity: 1,
  }));
  const { error } = await supabase().from("shared_item_group_items").upsert(rows, { onConflict: "group_id,label_code" });
  if (error) throw new Error("기본 물품 저장에 실패했어요.");
  if (state.groupId === groupId) await selectGroup(groupId);
}


export class ReturnSaveError extends Error {
  constructor(message: string, public readonly safeToEdit = false) { super(message); }
}

// DB 함수가 여러 품목 증가와 요청 ID 기록을 한 트랜잭션으로 처리한다.
export async function confirmReturn(groupId: string, counts: Record<string, number>, requestId: string) {
  const { data, error } = await supabase().rpc("confirm_shared_return", {
    p_request_id: requestId, p_group_id: groupId, p_counts: counts,
  }).abortSignal(AbortSignal.timeout(20000));
  if (error) {
    if (error.code === "PGRST202") throw new ReturnSaveError("반납 저장용 DB 설정이 아직 적용되지 않았어요.", true);
    if (["22023", "23503", "23514"].includes(error.code)) throw new ReturnSaveError(error.message, true);
    throw new ReturnSaveError("저장 응답을 확인하지 못했어요. 수량을 바꾸지 않고 다시 저장해 주세요.");
  }
  const rows = data?.items as { label_code: string; expected_quantity: number }[] | undefined;
  if (!Array.isArray(rows) || !rows.every((row) => names[row.label_code] && Number.isInteger(row.expected_quantity) && row.expected_quantity >= 0 && row.expected_quantity <= 999)) {
    throw new ReturnSaveError("저장 결과를 확인하지 못했어요. 다시 저장해 주세요.");
  }
  // loading 상태를 바꾸면 반납 화면이 사라지므로 반환된 최신 재고만 교체한다.
  if (state.groupId === groupId) publish({ items: rows.map((row) => ({
    id: row.label_code, name: names[row.label_code], quantity: row.expected_quantity,
  })) });
}
