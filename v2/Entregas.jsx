import { useMemo, useState } from "react";
import { useData } from "../state/Data.jsx";
import { useAuth } from "../state/Auth.jsx";
import { todayISO, addDays, formatDateFull, formatDateBR, dowShort } from "../lib/dates.js";
import { getDeliveriesForRange, CANCELLED } from "../lib/schedule.js";
import { groupStops, buildRoteiroText, buildRoteiroHTML, printHtmlDoc } from "../lib/roteiro.js";
import { Modal, Field, copyText } from "../components/ui.jsx";

export default function Entregas() {
  const D = useData();
  const { isStaff } = useAuth();
  const [date, setDate] = useState(todayISO());
  const [resch, setResch] = useState(null), [newDate, setNewDate] = useState("");
  const items = useMemo(() => getDeliveriesForRange(D.plans, D.reschedules, D.avulsaOrders, date, date), [D, date]);
  const stops = groupStops(items);
  const days = Array.from({ length: 7 }, (_, i) => addDays(todayISO(), i - 1));
  const statusFor = (s) => (s.pets.every((p) => D.statusOf(p.clientId, p.date) === "entregue") ? "entregue" : "pendente");
  const toggle = (s) => { const next = statusFor(s) === "entregue" ? "pendente" : "entregue"; s.pets.forEach((p) => {
    D.setStatus(p.clientId, p.date, next);
    const plan = D.plans.find((x) => x.id === p.clientId);
    if (plan && plan.frequency !== "avulsa" && plan.units) D.adjust("sub", p.clientId, next === "entregue" ? -plan.units : plan.units);
  }); };
  return (<>
    <div className="tabs">{days.map((d) => <button key={d} className={d === date ? "on" : ""} onClick={() => setDate(d)}>{dowShort(d)} {formatDateBR(d)}</button>)}</div>
    <div className="row" style={{ marginBottom: 12 }}>
      <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 160 }} />
      <span className="grow" />
      <button className="btn ghost sm" disabled={!items.length} onClick={() => copyText(buildRoteiroText(date, items, { statusOf: D.statusOf }), D.say)}>Copiar p/ WhatsApp</button>
      <button className="btn sm" disabled={!items.length} onClick={() => printHtmlDoc(buildRoteiroHTML(date, items))}>PDF / Imprimir</button>
    </div>
    <div className="muted" style={{ marginBottom: 8 }}>{formatDateFull(date)} · {stops.length} parada(s) · {items.length} pet(s)</div>
    {!stops.length && <div className="card muted">Sem entregas neste dia.</div>}
    {stops.map((s, i) => { const ok = statusFor(s) === "entregue"; return (
      <div key={s.key} className="card" style={ok ? { opacity: .6 } : null}>
        <div className="row"><b className="grow">{i + 1}. {s.pets.map((p) => p.dog).join(" & ")}</b>
          <button className={"btn sm " + (ok ? "ghost" : "ok")} onClick={() => toggle(s)}>{ok ? "✓ Entregue" : "Marcar entregue"}</button></div>
        <div className="muted">{s.tutor}</div>
        <div>📍 {s.address}{s.bairro ? " - " + s.bairro : ""}</div>
        {s.complemento && <div className="muted">🏢 {s.complemento}</div>}
        {s.referencia && <div className="muted">🧭 {s.referencia}</div>}
        {s.janelaEntrega && <div className="muted">🕒 {s.janelaEntrega}</div>}
        {(s.volumes || s.units) ? <div className="muted">📦 {s.volumes ? s.volumes + " vol." : ""} {s.units ? s.units + " un." : ""}</div> : null}
        {s.notes && <div className="muted">📝 {s.notes}</div>}
        <div className="row" style={{ marginTop: 8 }}>
          {s.address && <a className="btn ghost sm" target="_blank" rel="noreferrer" href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(s.address + " " + (s.bairro || "") + " São Paulo")}>Mapa</a>}
          {s.phone && <a className="btn ghost sm" href={"tel:" + s.phone.replace(/\D/g, "")}>Ligar</a>}
          {isStaff && <button className="btn ghost sm" onClick={() => { setResch({ stop: s }); setNewDate(addDays(date, 1)); }}>Reagendar</button>}
        </div>
      </div>); })}
    {resch && <Modal title="Reagendar entrega" onClose={() => setResch(null)}>
      <Field label="Nova data"><input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></Field>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={async () => { for (const p of resch.stop.pets) await D.reschedule(p.clientId, date, newDate); await D.reload(); setResch(null); }}>Mover</button>
        <button className="btn bad" onClick={async () => { for (const p of resch.stop.pets) await D.reschedule(p.clientId, date, CANCELLED); await D.reload(); setResch(null); }}>Cancelar esta entrega</button>
      </div></Modal>}
  </>);
}
