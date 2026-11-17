"use client";

import { useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { modelLabel } from "../return/modelLabels";

export type Item = { id: string; name: string; quantity: number };
export type ItemInput = { name: string; quantity: number };
type Group = { id: string; name: string };
type Inventory = {
  items: Item[];
  groups: Group[];
  groupId: string;
  email: string;
  local: boolean;
  ready: boolean;
  loading: boolean;
  error: string;
};
export const NAME_MAX_LENGTH = 30;
export const QUANTITY_MIN = 1;
export const QUANTITY_MAX = 999;
const names: Record<string, string> = { calculator: "계산기", scissors: "가위", mouse: "마우스" };
const initial: Inventory = { items: [], groups: [], groupId: "", email: "", local: true, ready: false, loading: false, error: "" };
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

const LOCAL_KEY = "return-inventory-guest-v1";
type LocalInventory = { groups: Group[]; groupId: string; items: Record<string, Item[]> };
let localData: LocalInventory;

function persistLocal(next: LocalInventory) {
  try { window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next)); }
  catch { throw new Error("이 브라우저에 저장하지 못했어요. 저장 공간 설정을 확인해 주세요."); }
  localData = next;
}

export function loadGuestInventory() {
  ++revision;
  const defaultGroup = { id: "local-default", name: "기본 물품" };
  let data: LocalInventory = {
    groups: [defaultGroup], groupId: defaultGroup.id,
    items: { [defaultGroup.id]: Object.entries(names).map(([id, name]) => ({ id, name, quantity: 1 })) },
  };
  try {
    const saved = JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? "null");
    if (saved && Array.isArray(saved.groups) && saved.groups.length && saved.groups.every(
      (group: Group) => typeof group.id === "string" && typeof group.name === "string" && Array.isArray(saved.items?.[group.id]) && saved.items[group.id].every(
        (item: Item) => typeof item.id === "string" && names[item.id] && item.name === names[item.id] && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 999,
      ),
    ) && saved.groups.some((group: Group) => group.id === saved.groupId)) data = saved;
  } catch { /* 저장 자료가 없거나 잘못됐으면 기본 목록으로 시작한다. */ }
  localData = data;
  publish({ ...initial, local: true, ready: true, groups: data.groups, groupId: data.groupId, items: data.items[data.groupId] });
}

async function readItems(groupId: string) {
  const { data, error } = await supabase().from("item_group_items")
    .select("label_code,expected_quantity").eq("group_id", groupId).order("label_code");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.label_code as string,
    name: names[row.label_code] ?? row.label_code,
    quantity: row.expected_quantity as number,
  }));
}

export async function selectGroup(groupId: string) {
  if (state.local) {
    if (!localData.groups.some((group) => group.id === groupId)) return;
    persistLocal({ ...localData, groupId });
    publish({ groupId, items: localData.items[groupId], error: "" });
    return;
  }
  const current = ++revision;
  publish({ groupId, items: [], loading: true, error: "" });
  try {
    const items = await readItems(groupId);
    if (current === revision) publish({ items, loading: false });
  } catch {
    if (current === revision) publish({ error: "그룹 물품을 읽지 못했어요. 다시 선택해 주세요.", loading: false });
  }
}

export async function loadInventory(user: User | null) {
  if (!user) { loadGuestInventory(); return; }
  const current = ++revision;
  publish({ ...initial, ready: true, email: user.email ?? "", local: false, loading: true });
  const { data, error } = await supabase().from("item_groups").select("id,name").order("created_at");
  if (current !== revision) return;
  if (error) {
    publish({ error: "물품 그룹을 불러오지 못했어요. 새로고침해 주세요.", loading: false });
    return;
  }
  const groups = (data ?? []) as Group[];
  publish({ groups, loading: false });
  if (groups[0]) await selectGroup(groups[0].id);
}

export async function createGroup(name: string) {
  const current = revision;
  if (!name.trim() || name.trim().length > 100) throw new Error("그룹 이름을 1~100자로 입력해 주세요.");
  if (state.local) {
    const group = { id: "local-" + crypto.randomUUID(), name: name.trim() };
    persistLocal({ groups: [...localData.groups, group], groupId: group.id, items: { ...localData.items, [group.id]: [] } });
    publish({ groups: localData.groups, groupId: group.id, items: [] });
    return;
  }
  const { data, error } = await supabase().from("item_groups")
    .insert({ name: name.trim() }).select("id,name").single();
  if (error || !data) throw new Error("그룹 생성에 실패했어요.");
  if (current !== revision) return;
  publish({ groups: [...state.groups, data as Group] });
  await selectGroup(data.id);
}

export function validateItem(input: ItemInput, items: Item[], editingId: string | null) {
  const code = modelLabel(input.name);
  if (!code) return "물품 이름은 계산기, 가위, 마우스 중에서 입력해 주세요.";
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 999) {
    return "수량은 1~999 사이 정수로 입력해 주세요.";
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
  if (state.local) {
    const entry = { id: code, name: names[code], quantity: input.quantity };
    const items = editingId ? state.items.map((item) => item.id === editingId ? entry : item) : [...state.items, entry];
    persistLocal({ ...localData, items: { ...localData.items, [groupId]: items } });
    publish({ items });
    return;
  }
  const row = { label_code: code, expected_quantity: input.quantity };
  const table = supabase().from("item_group_items");
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
  if (state.local) {
    const items = Object.entries(names).map(([id, name]) => ({ id, name, quantity: 1 }));
    persistLocal({ ...localData, items: { ...localData.items, [groupId]: items } });
    publish({ items });
    return;
  }
  const rows = Object.keys(names).map((code) => ({
    group_id: groupId, label_code: code, expected_quantity: 1,
  }));
  const { error } = await supabase().from("item_group_items").upsert(rows, { onConflict: "group_id,label_code" });
  if (error) throw new Error("기본 물품 저장에 실패했어요.");
  if (state.groupId === groupId) await selectGroup(groupId);
}
