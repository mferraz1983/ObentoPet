import { useMemo, useState } from "react";
import { useData } from "../state/Data.jsx";
import { useAuth } from "../state/Auth.jsx";
import { db, callFn } from "../lib/supabase.js";
import { Tabs, Badge, Modal, Field, copyText } from "../components/ui.jsx";
import { todayISO, weekStartOf, addDays, formatDateBR } from "../lib/dates.js";
import { buildProduction, buildProductionText, buildProductionHTML, assignRounds, unitsPerWeek, rodadaDaSemana, DEFAULT_ANCHOR } from "../lib/production.js";
import { printHtmlDoc } from "../lib/roteiro.js";

export default function Produtos() {
  const [tab, setTab] = useState("estoque");
  return (<>
    <Tabs value={tab} onChange={setTab} tabs={[["estoque", "ESTOQUE"], ["producao", "PRODUÇÃO"]]} />
    {tab === "estoque" ? <Estoque /> : <Producao />}
  </>);
}

function StockRow({ name, balance, min, sub, onAdj, canEdit }) {
  const low = min > 0 && balance < min;
  return (
    <div className="stop"><div className="row">
      <div className="grow"><b>{name}</b> {low && <Badge color="#B5483A">abaixo do mínimo</Badge>}<div className="muted">{sub} mín. {min || 0}</div></div>
      {canEdit && <button className="btn ghost sm" onClick={() => onAdj(-1)}>−</button>}
      <b style={{ minWidth: 28, textAlign: "center", color: low ? "var(--bad)" : "inherit" }}>{balance}</b>
      {canEdit && <button className="btn ghost sm" onClick={() => onAdj(1)}>+</button>}
    </div></div>
  );
}

function Estoque() {
  const D = useData();
  const { isStaff, isAdmin } = useAuth();
  const [sub, setSub] = useState("assinante");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const bling = async () => { setBusy(true); try { const r = await callFn("bling-sync", { action: "catalog" }); await D.reload(); D.say(r?.message || "Catálogo atualizado"); } catch (e) { D.say("Bling: " + e.message); } setBusy(false); };
  const match = (s) => s.toLowerCase().includes(q.toLowerCase());
  return (<>
    <Tabs value={sub} onChange={setSub} tabs={[["assinante", "ASSINANTE"], ["avulso", "AVULSO"], ["petiscos", "PETISCOS"]]} />
    <div className="row" style={{ marginBottom: 8 }}><input className="grow" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
      {isAdmin && <button className="btn ghost sm" disabled={busy} onClick={bling}>{busy ? "…" : "Sincronizar Bling"}</button>}</div>
    {sub === "assinante" && D.plans.filter((p) => p.frequency !== "avulsa" && match(p.dog + p.tutor)).sort((a, b) => a.dog.localeCompare(b.dog)).map((p) => (
      <StockRow key={p.id} name={p.dog} sub={`${p.tutor} ·`} balance={D.balances[p.id] ?? 0} min={p.minStock ?? p.units} canEdit={isStaff} onAdj={(d) => D.adjust("sub", p.id, d)} />))}
    {sub === "avulso" && D.shelf.filter((p) => match(p.name)).map((p) => (
      <StockRow key={p.id} name={p.name} sub={p.sku ? p.sku + " ·" : ""} balance={p.balance} min={p.min_stock} canEdit={isStaff} onAdj={(d) => D.adjust("shelf", p.id, d)} />))}
    {sub === "petiscos" && D.snack.filter((p) => match(p.name)).map((p) => (
      <StockRow key={p.id} name={p.name} sub={p.sku ? p.sku + " ·" : ""} balance={p.balance} min={p.min_stock} canEdit={isStaff} onAdj={(d) => D.adjust("snack", p.id, d)} />))}
  </>);
}

function Producao() {
  const D = useData();
  const { isAdmin } = useAuth();
  const [off, setOff] = useState(1); // padrão: semana que vem
  const today = todayISO();
  const weekStart = weekStartOf(today, off);
  const anchor = D.settings?.production_anchor || DEFAULT_ANCHOR;
  const prod = useMemo(() => buildProduction({
    weekStart, today, plans: D.plans, petsById: D.petsById, balances: D.balances, reschedules: D.reschedules,
    statusOf: D.statusOf, dietsByPet: D.dietsByPet, anchor, shelf: D.shelf, snack: D.snack,
  }), [D, weekStart, today, anchor]);

  const rebalance = async () => {
    const subs = D.plans.filter((p) => p.frequency !== "avulsa" && p.petId);
    const res = assignRounds(subs.map((p) => ({ petId: p.petId, rodada: D.petsById[p.petId]?.rodada, fixa: D.petsById[p.petId]?.rodada_fixa, weekly: unitsPerWeek(p) })), { rebalance: true });
    const rows = Object.entries(res).map(([id, rodada]) => ({ ...D.petsById[id], rodada }));
    if (!rows.length) return D.say("Nada a rebalancear");
    const { error } = await db.from("pets").upsert(rows);
    if (error) return D.say(error.message);
    await D.reload(); D.say(`${rows.length} pets redistribuídos entre A e B`);
  };
  const saveRun = async () => {
    const { error } = await db.from("production_runs").insert({ semana_inicio: weekStart, rodada: prod.rodada, payload: { total: prod.total, byDiet: prod.byDiet, pets: prod.pets } });
    D.say(error ? error.message : "Produção registrada");
  };
  return (<>
    <div className="row" style={{ marginBottom: 10 }}>
      <button className="btn ghost sm" onClick={() => setOff(off - 1)}>◀</button>
      <b className="grow" style={{ textAlign: "center" }}>Semana {formatDateBR(weekStart)} – {formatDateBR(prod.weekEnd)}</b>
      <button className="btn ghost sm" onClick={() => setOff(off + 1)}>▶</button>
    </div>
    <div className="card"><div className="row"><span className="big">Produção {prod.rodada}</span><span className="grow" />
      <div style={{ textAlign: "right" }}><b>{prod.total} un.</b><div className="muted">{prod.pets} pets · A {prod.volumeA} / B {prod.volumeB}</div></div></div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={() => printHtmlDoc(buildProductionHTML(prod, new Date().toLocaleString("pt-BR")))}>PDF / Imprimir</button>
        <button className="btn ghost sm" onClick={() => copyText(buildProductionText(prod), D.say)}>Copiar p/ WhatsApp</button>
        {isAdmin && <button className="btn ghost sm" onClick={rebalance}>Rebalancear A/B</button>}
        {isAdmin && <button className="btn ghost sm" onClick={saveRun}>Registrar</button>}
      </div></div>
    {!!prod.byDiet.length && <div className="card"><h3>Por dieta</h3><table><tbody>
      {prod.byDiet.map((d) => <tr key={d.sku || d.nome}><td>{d.nome}<div className="muted">{d.sku}</div></td><td><b>{d.qtd}</b></td></tr>)}
      {prod.semDieta > 0 && <tr><td>Sem dieta definida</td><td><b>{prod.semDieta}</b></td></tr>}</tbody></table></div>}
    <div className="card"><h3>Por pet</h3>
      {prod.rows.filter((r) => r.produzir > 0).map((r) => (
        <div key={r.plan.id} className="stop"><div className="row"><b className="grow">{r.plan.dog}</b>
          {r.kind === "antecipado" && <Badge color="#C9822B">antecipado</Badge>}<Badge>{r.rodada}</Badge><b>{r.produzir}</b></div>
          <div className="muted">{r.plan.tutor} · saldo {r.balance} · mín. {r.min}{r.porDieta.length ? " · " + r.porDieta.map((d) => `${d.qtd}× ${d.nome}`).join(", ") : ""}</div></div>))}
      {!prod.total && <span className="muted">Nada a produzir nesta semana.</span>}
    </div>
    {(prod.lowShelf.length > 0 || prod.lowSnack.length > 0) && <div className="card"><h3>Avulsos / petiscos abaixo do mínimo</h3>
      {[...prod.lowShelf, ...prod.lowSnack].map((x) => <div key={x.name} className="stop">{x.name} <b>+{x.produzir}</b></div>)}</div>}
  </>);
}
