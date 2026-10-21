import test from "node:test";
import assert from "node:assert/strict";
import { getOccurrencesInRange, CANCELLED } from "../src/lib/schedule.js";
import { addDays, weekStartOf, toISO } from "../src/lib/dates.js";
import { assignRounds, allocateByDiet, buildProduction, rodadaDaSemana } from "../src/lib/production.js";
import { upcomingBirthdays, ageLabel } from "../src/lib/birthdays.js";
import { validDoc, maskCpfCnpj } from "../src/lib/docs.js";
import { groupStops } from "../src/lib/roteiro.js";

test("semanal gera datas de 7 em 7 e respeita cancelamento", () => {
  const c = { id: "1", frequency: "semanal", nextDate: "2026-10-26" };
  assert.deepEqual(getOccurrencesInRange(c, "2026-10-19", "2026-11-09", []), ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"]);
  const r = [{ original_date: "2026-11-02", new_date: CANCELLED }];
  assert.deepEqual(getOccurrencesInRange(c, "2026-10-26", "2026-11-09", r), ["2026-10-26", "2026-11-09"]);
  const mv = [{ original_date: "2026-11-02", new_date: "2026-11-04" }];
  assert.deepEqual(getOccurrencesInRange(c, "2026-10-26", "2026-11-09", mv), ["2026-10-26", "2026-11-04", "2026-11-09"]);
});
test("mensal e quinzenal", () => {
  assert.deepEqual(getOccurrencesInRange({ id: "m", frequency: "mensal", nextDate: "2026-10-10" }, "2026-09-01", "2026-12-31", []), ["2026-09-10", "2026-10-10", "2026-11-10", "2026-12-10"]);
  assert.equal(getOccurrencesInRange({ id: "q", frequency: "quinzenal", nextDate: "2026-10-10" }, "2026-10-01", "2026-10-31", []).length, 2);
});
test("datas locais: domingo da semana", () => {
  assert.equal(weekStartOf("2026-10-21"), "2026-10-18");
  assert.equal(weekStartOf("2026-10-21", 1), "2026-10-25");
  assert.equal(toISO(new Date(2026, 9, 21, 23, 30)), "2026-10-21");
});
test("rodadas alternam", () => {
  assert.equal(rodadaDaSemana("2026-10-25"), "A");
  assert.equal(rodadaDaSemana("2026-11-01"), "B");
  assert.equal(rodadaDaSemana("2026-11-08"), "A");
  assert.equal(rodadaDaSemana("2026-10-18"), "B");
});
test("balanceamento A/B equilibra e respeita fixos", () => {
  const items = [10, 9, 8, 7, 6, 5, 4, 3].map((w, i) => ({ petId: "p" + i, rodada: null, fixa: false, weekly: w }));
  items.push({ petId: "fx", rodada: "A", fixa: true, weekly: 20 });
  const out = assignRounds(items);
  const tot = { A: 20, B: 0 };
  items.slice(0, 8).forEach((it) => (tot[out[it.petId]] += it.weekly));
  assert.ok(Math.abs(tot.A - tot.B) <= 10, JSON.stringify(tot));
  assert.equal(out.fx, undefined);
  const rb = assignRounds(items.map((i) => ({ ...i, rodada: "A" })), { rebalance: true });
  assert.ok(Object.values(rb).includes("B"));
});
test("allocateByDiet soma exatamente o total", () => {
  const r = allocateByDiet(7, [{ product_id: 1, nome: "a", qtd_mensal: 20 }, { product_id: 2, nome: "b", qtd_mensal: 10 }]);
  assert.equal(r.reduce((s, x) => s + x.qtd, 0), 7);
  assert.equal(r.find((x) => x.productId === 1).qtd, 5);
});
function mk(rodada, extra = {}) {
  const plan = { id: "c1", petId: "p1", dog: "Mia", tutor: "Ana", frequency: "semanal", nextDate: "2026-10-26", units: 4, ...extra };
  return { plans: [plan], petsById: { p1: { id: "p1", rodada, ativo: true } } };
}
test("produção: pet da rodada cobre 14 dias + mínimo; fora da rodada não entra", () => {
  const base = { weekStart: "2026-10-25", today: "2026-10-21", balances: { c1: 6 }, reschedules: {}, statusOf: () => "preparando" };
  // entregas 26/10 (W1) e 02/11 (W2) = 8 un; comprometido antes de 25/10: nenhuma (26 é depois)
  const a = buildProduction({ ...base, ...mk("A") });
  assert.equal(a.rodada, "A");
  assert.equal(a.rows[0].produzir, 8 + 4 - 6); // demanda + mínimo(4) - saldo
  const b = buildProduction({ ...base, ...mk("B"), balances: { c1: 20 } });
  assert.equal(b.rows.length, 0); // estoque folgado: não entra na rodada A
});
test("produção: antecipado quando estoque cai abaixo do mínimo", () => {
  const base = { weekStart: "2026-10-25", today: "2026-10-21", balances: { c1: 6 }, reschedules: {}, statusOf: () => "preparando" };
  const b = buildProduction({ ...base, ...mk("B") });
  assert.equal(b.rows.length, 1);
  assert.equal(b.rows[0].kind, "antecipado");
  assert.equal(b.rows[0].produzir, 4 - (6 - 4)); // min - projetado
  const ok = buildProduction({ ...base, ...mk("B"), balances: { c1: 20 } });
  assert.equal(ok.rows.length, 0);
});
test("aniversários e idade", () => {
  const pets = [{ nome: "Rex", nascimento: "2020-10-21", ativo: true }, { nome: "Lua", nascimento: "2024-02-29", ativo: true }, { nome: "X", nascimento: "2019-10-25", ativo: true }];
  assert.deepEqual(upcomingBirthdays(pets, "2026-10-21", 0).map((x) => x.pet.nome), ["Rex"]);
  assert.equal(upcomingBirthdays(pets, "2026-10-21", 7).length, 2);
  assert.equal(upcomingBirthdays(pets, "2027-02-28", 0)[0].pet.nome, "Lua");
  assert.equal(ageLabel("2024-08-10", "2026-10-21"), "2 anos e 2 meses");
});
test("CPF/CNPJ", () => {
  assert.equal(validDoc("529.982.247-25"), true);
  assert.equal(validDoc("111.111.111-11"), false);
  assert.equal(validDoc("11.222.333/0001-81"), true);
  assert.equal(maskCpfCnpj("52998224725"), "529.982.247-25");
});
test("paradas agrupam pets do mesmo tutor", () => {
  const items = [
    { client: { id: "1", tutorId: "t", tutor: "Ana", dog: "Mia", address: "Rua A", units: 2 }, date: "2026-10-26" },
    { client: { id: "2", tutorId: "t", tutor: "Ana", dog: "Margot", address: "Rua A", units: 3 }, date: "2026-10-26" },
  ];
  const s = groupStops(items);
  assert.equal(s.length, 1); assert.equal(s[0].units, 5);
});
