import { useEffect, useState } from "react";
import { db, callFn } from "../lib/supabase.js";
import { useData } from "../state/Data.jsx";
import { Field, Modal, Tabs } from "../components/ui.jsx";
import { printHtmlDoc } from "../lib/roteiro.js";
import { labelPagesHTML, loadLabelStore, activeLabelSettings } from "../lib/labels.js";
import { getDeliveriesForRange } from "../lib/schedule.js";
import { todayISO, addDays } from "../lib/dates.js";

export default function Admin() {
  const D = useData();
  const [tab, setTab] = useState("usuarios");
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(null);
  const [logs, setLogs] = useState([]);
  const load = async () => {
    const [u, l] = await Promise.all([db.from("profiles").select("*").order("nome"), db.from("notification_log").select("*").order("created_at", { ascending: false }).limit(30)]);
    setUsers(u.data || []); setLogs(l.data || []);
  };
  useEffect(() => { load(); }, []);
  const settings = D.settings || {};
  const setSetting = async (key, value) => { const { error } = await db.from("app_settings").upsert({ key, value }); D.say(error ? error.message : "Salvo"); D.reload(); };
  const create = async () => {
    try { await callFn("admin-users", { action: "create", ...form }); setForm(null); load(); D.say("Usuário criado"); } catch (e) { D.say(e.message); }
  };
  const labels = (date) => {
    const items = getDeliveriesForRange(D.plans, D.reschedules, D.avulsaOrders, date, date).map((i) => i.client);
    if (!items.length) return D.say("Sem entregas nessa data");
    printHtmlDoc(labelPagesHTML(items.map((c) => ({ ...c, date })), activeLabelSettings(loadLabelStore())), { waitFonts: true });
  };
  return (<>
    <Tabs value={tab} onChange={setTab} tabs={[["usuarios", "Usuários"], ["avisos", "Avisos"], ["etiquetas", "Etiquetas"]]} />
    {tab === "usuarios" && (<>
      <button className="btn" onClick={() => setForm({ nome: "", email: "", password: "", role: "portador" })}>+ Novo usuário</button>
      {users.map((u) => (
        <div key={u.user_id} className="card row"><b className="grow">{u.nome}</b>
          <select style={{ width: 140 }} value={u.role || ""} onChange={async (e) => { await db.from("profiles").update({ role: e.target.value || null }).eq("user_id", u.user_id); load(); }}>
            <option value="">sem acesso</option><option value="admin">admin</option><option value="operacional">operacional</option><option value="portador">portador</option></select>
        </div>))}
      {form && <Modal title="Novo usuário" onClose={() => setForm(null)}>
        <Field label="Nome"><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field>
        <Field label="E-mail"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Senha inicial (mín. 10 caracteres)"><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <Field label="Perfil"><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option>portador</option><option>operacional</option><option>admin</option></select></Field>
        <button className="btn" style={{ marginTop: 12 }} onClick={create}>Criar</button></Modal>}
    </>)}
    {tab === "avisos" && (<>
      <div className="card"><h3>Disparos automáticos (ManyChat)</h3>
        {[["dispatch_couriers_enabled", "Roteiro diário aos portadores (7h)"], ["notify_customers_enabled", "Aviso aos clientes na véspera (17h)"], ["friday_production_enabled", "Documento de produção (sexta 14h)"]].map(([k, l]) => (
          <label key={k} className="row" style={{ margin: "8px 0" }}><input type="checkbox" style={{ width: 22 }} checked={!!settings[k]} onChange={(e) => setSetting(k, e.target.checked)} /> {l}</label>))}
        <Field label="Telefones dos portadores (um por linha, com DDD)"><textarea rows={3} defaultValue={(settings.couriers || []).join("\n")} onBlur={(e) => setSetting("couriers", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} /></Field>
        <Field label="Telefone/contato que recebe a produção"><input defaultValue={settings.production_recipient || ""} onBlur={(e) => setSetting("production_recipient", e.target.value)} /></Field>
        <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={async () => { try { const r = await callFn("daily-dispatch", { dryRun: true }); D.say(r.message || "Teste OK"); } catch (e) { D.say(e.message); } }}>Testar (sem enviar)</button>
      </div>
      <div className="card"><h3>Últimos envios</h3>{logs.map((l) => <div key={l.id} className="stop muted">{new Date(l.created_at).toLocaleString("pt-BR")} · {l.kind} · {l.status}{l.detail ? " · " + l.detail : ""}</div>)}</div>
    </>)}
    {tab === "etiquetas" && <div className="card"><h3>Imprimir etiquetas</h3>
      <button className="btn" onClick={() => labels(todayISO())}>Entregas de hoje</button>{" "}
      <button className="btn ghost" onClick={() => labels(addDays(todayISO(), 1))}>Entregas de amanhã</button></div>}
  </>);
}
