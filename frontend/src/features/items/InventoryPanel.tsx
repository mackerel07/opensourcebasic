"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { createGroup, loadInventory, selectGroup, useInventory } from "./itemStore";

export function InventoryPanel() {
  const inventory = useInventory();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [groupName, setGroupName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const client = supabase();
    let active = true;
    let eventSeen = false;
    let lastUserId: string | null | undefined;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      eventSeen = true;
      const userId = session?.user.id ?? null;
      if (userId === lastUserId) return;
      lastUserId = userId;
      window.setTimeout(() => {
        if (active) void loadInventory(session?.user ?? null);
      }, 0);
    });
    void client.auth.getSession().then(({ data }) => {
      if (active && !eventSeen) void loadInventory(data.session?.user ?? null);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    setMessage(error ? "로그인에 실패했어요. 이메일 인증과 비밀번호를 확인해 주세요." : "");
    if (!error) setPassword("");
    setBusy(false);
  }

  async function signup() {
    setBusy(true);
    const { error } = await supabase().auth.signUp({ email, password });
    setMessage(error ? error.message : "가입 메일에서 인증한 뒤 로그인해 주세요.");
    setBusy(false);
  }

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

  return (
    <section className="inventory-panel" aria-label="로그인과 물품 그룹">
      {!inventory.ready ? <p>로그인 상태를 확인하고 있어요.</p> : !inventory.email ? (
        <form onSubmit={login}>
          <strong>로그인하면 내 물품 그룹을 저장할 수 있어요.</strong>
          <label>이메일<input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>비밀번호<input className="input" type="password" autoComplete="current-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <div><button className="btn btn-primary" disabled={busy}>로그인</button>{" "}
            <button type="button" className="btn" disabled={busy || !email || password.length < 6} onClick={signup}>회원가입</button></div>
        </form>
      ) : (
        <>
          <div>{inventory.email} <button type="button" className="btn btn-small" onClick={async () => {
            const { error } = await supabase().auth.signOut();
            if (error) setMessage("로그아웃에 실패했어요. 다시 시도해 주세요.");
            else { setMessage(""); await loadInventory(null); }
          }}>로그아웃</button></div>
          <label>물품 그룹<select className="input" value={inventory.groupId} disabled={inventory.loading || busy}
            onChange={(e) => void selectGroup(e.target.value)}>
            <option value="" disabled>그룹을 만들어 주세요</option>
            {inventory.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select></label>
          <form onSubmit={addGroup}>
            <label>새 그룹 이름<input className="input" value={groupName} maxLength={100} required onChange={(e) => setGroupName(e.target.value)} /></label>
            <button className="btn" disabled={busy || inventory.loading}>그룹 만들기</button>
          </form>
        </>
      )}
      {inventory.loading && <p role="status">그룹을 불러오고 있어요.</p>}
      {(message || inventory.error) && <p role="status">{message || inventory.error}</p>}
    </section>
  );
}
