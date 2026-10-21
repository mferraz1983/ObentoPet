import { parseISO, todayISO, addDays } from "./dates.js";

// Aniversário em `year` (29/02 vira 28/02 em ano não bissexto)
function birthdayIn(nascimento, year) {
  const [, m, d] = nascimento.split("-").map(Number);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const dd = m === 2 && d === 29 && !leap ? 28 : d;
  return `${year}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}
export function ageOn(nascimento, iso) {
  const [by, bm, bd] = nascimento.split("-").map(Number);
  const [y, m, d] = iso.split("-").map(Number);
  let age = y - by; if (m < bm || (m === bm && d < bd)) age--; return age;
}
export function ageLabel(nascimento, iso = todayISO()) {
  if (!nascimento) return "";
  const [by, bm, bd] = nascimento.split("-").map(Number);
  const [y, m, d] = iso.split("-").map(Number);
  let months = (y - by) * 12 + (m - bm) - (d < bd ? 1 : 0);
  if (months < 0) return "";
  if (months < 12) return `${months} ${months === 1 ? "mês" : "meses"}`;
  const yrs = Math.floor(months / 12), rest = months % 12;
  return `${yrs} ${yrs === 1 ? "ano" : "anos"}${rest ? ` e ${rest} ${rest === 1 ? "mês" : "meses"}` : ""}`;
}
// Pets que fazem aniversário entre today e today+days (inclusive). Ordenado por data.
export function upcomingBirthdays(pets, today = todayISO(), days = 0) {
  const end = addDays(today, days);
  const years = [...new Set([parseISO(today).getFullYear(), parseISO(end).getFullYear()])];
  const out = [];
  for (const p of pets) {
    if (!p.nascimento || p.ativo === false) continue;
    for (const y of years) {
      const when = birthdayIn(p.nascimento, y);
      if (when >= today && when <= end) out.push({ pet: p, date: when, age: ageOn(p.nascimento, when) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.pet.nome.localeCompare(b.pet.nome));
}
