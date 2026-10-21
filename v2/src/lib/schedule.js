import { addDays, parseISO, toISO } from "./dates.js";

// Reagendamento com new_date = CANCELADA significa "esta ocorrência foi cancelada"
export const CANCELLED = "1900-01-01";

// Ocorrências de um plano recorrente (semanal/quinzenal/mensal) dentro de [startISO, endISO]
export function getOccurrencesInRange(client, startISO, endISO, clientReschedules = []) {
  if (client.frequency === "avulsa") return [];
  const rescheduledOriginals = new Set(clientReschedules.map((r) => r.original_date));
  const out = [];
  if (client.nextDate) {
    if (client.frequency === "mensal") {
      let cur = parseISO(client.nextDate);
      const start = parseISO(startISO), end = parseISO(endISO);
      while (cur > start) { const p = new Date(cur); p.setMonth(p.getMonth() - 1); cur = p; }
      while (cur <= end) {
        if (cur >= start) { const d = toISO(cur); if (!rescheduledOriginals.has(d)) out.push(d); }
        const n = new Date(cur); n.setMonth(n.getMonth() + 1); cur = n;
      }
    } else {
      const step = client.frequency === "semanal" ? 7 : 14;
      let cur = client.nextDate;
      while (cur > startISO) cur = addDays(cur, -step);
      while (cur <= endISO) {
        if (cur >= startISO && !rescheduledOriginals.has(cur)) out.push(cur);
        cur = addDays(cur, step);
      }
    }
  }
  const result = new Set(out);
  clientReschedules.forEach((r) => { if (r.new_date >= startISO && r.new_date <= endISO) result.add(r.new_date); });
  return Array.from(result).sort();
}

// Todas as entregas (recorrentes + avulsas) no intervalo. Item: { client, date, orderId }
export function getDeliveriesForRange(clients, reschedules, avulsaOrders, startISO, endISO) {
  const recurring = clients
    .filter((c) => c.frequency !== "avulsa")
    .flatMap((c) => getOccurrencesInRange(c, startISO, endISO, reschedules[c.id] || []).map((date) => ({ client: c, date, orderId: null })));
  const avulsa = clients
    .filter((c) => c.frequency === "avulsa")
    .flatMap((c) => {
      const orders = avulsaOrders[c.id];
      if (orders && orders.length > 0)
        return orders.filter((o) => o.date >= startISO && o.date <= endISO).map((o) => ({ client: c, date: o.date, orderId: o.id }));
      if (c.nextDate && c.nextDate >= startISO && c.nextDate <= endISO) return [{ client: c, date: c.nextDate, orderId: null }];
      return [];
    });
  return [...recurring, ...avulsa].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.client.tutor || "").localeCompare(b.client.tutor || "") || (a.client.dog || "").localeCompare(b.client.dog || "")
  );
}

export const freqDays = (f) => (f === "semanal" ? 7 : f === "quinzenal" ? 14 : f === "mensal" ? 30 : 0);
