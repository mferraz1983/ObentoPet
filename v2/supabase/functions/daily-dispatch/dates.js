// Datas sempre em horário LOCAL (America/Sao_Paulo no uso real). Formato ISO "AAAA-MM-DD".
export const weekdayNames = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
export const weekdayShort = ["DOM","SEG","TER","QUA","QUI","SEX","SÁB"];
export const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const pad = (n) => String(n).padStart(2, "0");
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12, 0, 0); };
export const todayISO = (now = new Date()) => toISO(now);
export const addDays = (iso, days) => { const d = parseISO(iso); d.setDate(d.getDate() + days); return toISO(d); };
export const tomorrowISO = (now = new Date()) => addDays(todayISO(now), 1);
export const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
export const dow = (iso) => parseISO(iso).getDay();
export const dowShort = (iso) => weekdayShort[dow(iso)];

export function formatDateBR(iso) { if (!iso) return ""; const [, m, d] = iso.split("-"); return `${d}/${m}`; }
export function formatDateBRFull(iso) { if (!iso) return ""; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; }
export function formatDateFull(iso) { if (!iso) return ""; const d = parseISO(iso); return `${weekdayNames[d.getDay()]}, ${d.getDate()} de ${monthNames[d.getMonth()]}`; }

// Domingo da semana que contém `iso`, deslocado em `offsetWeeks` semanas
export function weekStartOf(iso, offsetWeeks = 0) { return addDays(iso, -dow(iso) + offsetWeeks * 7); }
export function getWeekNumber(iso) {
  const d = parseISO(iso); const jan1 = new Date(d.getFullYear(), 0, 1, 12);
  return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
}
export const weeksBetween = (a, b) => Math.round(diffDays(a, b) / 7);
export const genId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "id_" + Date.now() + "_" + Math.random().toString(36).slice(2);
