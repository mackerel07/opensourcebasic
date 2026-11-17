"use client";

import { useEffect, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { createGroup, loadGuestInventory, loadInventory, selectGroup, useInventory } from "./itemStore";

export function InventoryPanel() {
  const inventory = useInventory();
  const pathname = usePathname();
  const [groupName, setGroupName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // 기존 계정 세션이 있으면 DB 자료를 유지하고, 없으면 가입 없이 시작한다.
    let active = true;
    void supabase().auth.getSession().then(({ data }) => {
      if (active) void loadInventory(data.session?.user ?? null);
    }).catch(() => { if (active) loadGuestInventory(); });
    return () => { active = false; };
  }, []);

  async function addGroup(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await createGroup(groupName);
      setGroupName("");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "그룹 생성 실패");
    } finally { setBusy(false); }
  }

  if (pathname === "/") return null;
  return (
    <section className="inventory-panel" aria-label="물품 그룹">
      {!inventory.ready ? <p className="hint">물품 목록을 준비하고 있어요.</p> : (
        <>
          <label>물품 그룹<select className="input" value={inventory.groupId} disabled={inventory.loading || busy}
            onChange={(e) => { void selectGroup(e.target.value).catch(() => setMessage("그룹을 선택하지 못했어요.")); }}>
            <option value="" disabled>그룹을 만들어 주세요</option>
            {inventory.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select></label>
          <details>
            <summary>새 그룹 만들기</summary>
            <form onSubmit={addGroup}>
              <label>그룹 이름<input className="input" value={groupName} maxLength={100} placeholder="예: 실습실 A" required onChange={(e) => setGroupName(e.target.value)} /></label>
              <button className="btn" disabled={busy || inventory.loading}>만들기</button>
            </form>
          </details>
          <p className="hint">{inventory.local ? "물품 목록은 이 브라우저에 저장돼요." : "물품 목록은 연결된 계정에 저장돼요."}</p>
        </>
      )}
      {inventory.loading && <p role="status">그룹을 불러오고 있어요.</p>}
      {(message || inventory.error) && <p className="error" role="status">{message || inventory.error}</p>}
    </section>
  );
}
