import { useMemo } from "react";
import { useData } from "../state/Data.jsx";
import { todayISO, addDays, formatDateFull, formatDateBR } from "../lib/dates.js";
import { getDeliveriesForRange } from "../lib/schedule.js";
import { groupStops } from "../lib/roteiro.js";
import { upcomingBirthdays, ageLabel } from "../lib/birthdays.js";

export const PENDING_WINDOW_DAYS = 14;

export default function Hoje({ go }) {
  const D = useData();
  const today = todayISO();
  const { todayItems, late, bdays } = useMemo(() => {
    const lateStart = addDays(today, -PENDING_WINDOW_DAYS);
    const all = getDeliveriesForRange(D.plans, D.reschedules, D.avulsaOrders, lateStart, today);
    return {
      todayItems: all.filter((i) => i.date === today),
      late: all.filter((i) => i.date < today && D.statusOf(i.client.id, i.date) !== "entregue"),
      bdays: upcomingBirthdays(D.pets, today, 0),
    };
  }, [D, today]);
  const done = todayItems.filter((i) => D.statusOf(i.client.id, i.date) === "entregue").length;
  const stops = groupStops(todayItems);
  return (<>
    <h2 style={{ margin: "0 0 12px" }}>{formatDateFull(today)}</h2>
    <div className="card">
      <h3>📦 Entregas de hoje</h3>
      <div className="row"><span className="big">{done}/{todayItems.length}</span><span className="muted">entregues · {stops.length} parada(s)</span></div>
      {stops.slice(0, 4).map((s) => <div key={s.key} className="stop"><b>{s.pets.map((p) => p.dog).join(" & ")}</b><div className="muted">{s.bairro || s.address}</div></div>)}
      <button className="btn" style={{ marginTop: 8 }} onClick={() => go("entregas")}>Abrir roteiro</button>
    </div>
    <div className="card">
      <h3>⏳ Entregas pendentes</h3>
      {!late.length ? <span className="muted">Nada atrasado nos últimos {PENDING_WINDOW_DAYS} dias.</span> :
        late.map((i) => <div key={i.client.id + i.date} className="stop"><b>{i.client.dog}</b> · {i.client.tutor}<div className="muted">era para {formatDateBR(i.date)}</div></div>)}
    </div>
    <div className="card">
      <h3>🎂 Aniversariantes de hoje</h3>
      {!bdays.length ? <span className="muted">Nenhum pet faz aniversário hoje.</span> :
        bdays.map((b) => <div key={b.pet.id} className="stop"><b>{b.pet.nome}</b> faz {ageLabel(b.pet.nascimento, b.date)} <div className="muted">{D.tutorsById[b.pet.tutor_id]?.nome}</div></div>)}
    </div>
  </>);
}
