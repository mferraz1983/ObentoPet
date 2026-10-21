import { addDays, weeksBetween, formatDateBR, dowShort } from "./dates.js";
import { getOccurrencesInRange, freqDays } from "./schedule.js";

// Semana "A" de referência (domingo). Semanas seguintes alternam B, A, B...
export const DEFAULT_ANCHOR = { date: "2026-10-25", rodada: "A" };
export const outraRodada = (r) => (r === "A" ? "B" : "A");

export function rodadaDaSemana(weekStart, anchor = DEFAULT_ANCHOR) {
  const n = weeksBetween(anchor.date, weekStart);
  return ((n % 2) + 2) % 2 === 0 ? anchor.rodada : outraRodada(anchor.rodada);
}

// Unidades por semana (média) de um plano recorrente
export const unitsPerWeek = (plan) => { const f = freqDays(plan.frequency); return f ? ((plan.units || 0) * 7) / f : 0; };

/**
 * Distribui pets entre A e B equilibrando o volume semanal (heurística LPT).
 * items: [{ petId, rodada, fixa, weekly }]
 * rebalance=false -> só atribui quem ainda não tem rodada; rebalance=true -> refaz todos os não fixos.
 * Retorna { [petId]: "A"|"B" } apenas para os pets que mudaram/foram atribuídos.
 */
export function assignRounds(items, { rebalance = false } = {}) {
  const tot = { A: 0, B: 0 };
  const todo = [];
  for (const it of items) {
    if (it.rodada && (it.fixa || !rebalance)) tot[it.rodada] += it.weekly;
    else todo.push(it);
  }
  todo.sort((a, b) => b.weekly - a.weekly || String(a.petId).localeCompare(String(b.petId)));
  const out = {};
  for (const it of todo) {
    const r = tot.A <= tot.B ? "A" : "B";
    tot[r] += it.weekly; out[it.petId] = r;
  }
  return out;
}

// Reparte `total` unidades entre dietas proporcionalmente à quantidade mensal (maiores restos)
export function allocateByDiet(total, diets) {
  if (!total || !diets?.length) return [];
  const sum = diets.reduce((s, d) => s + (d.qtd_mensal || 0), 0);
  if (!sum) return [];
  const raw = diets.map((d) => ({ d, exact: (total * d.qtd_mensal) / sum }));
  const out = raw.map((r) => ({ ...r, qtd: Math.floor(r.exact) }));
  let left = total - out.reduce((s, r) => s + r.qtd, 0);
  out.slice().sort((a, b) => (b.exact - b.qtd) - (a.exact - a.qtd)).forEach((r) => { if (left > 0) { r.qtd++; left--; } });
  return out.filter((r) => r.qtd > 0).map((r) => ({ productId: r.d.product_id, nome: r.d.nome, sku: r.d.sku, qtd: r.qtd }));
}

/**
 * Lista de produção da semana `weekStart` (domingo).
 * plans: planos recorrentes já mesclados (id, petId, dog, tutor, units, frequency, nextDate, minStock)
 * Regras:
 *  - Pets da rodada da semana produzem para cobrir 14 dias de entregas (esta semana + a seguinte) + estoque mínimo.
 *  - Pets da outra rodada só entram ("antecipado") se o estoque projetado ao fim da semana cair abaixo do mínimo.
 *  - Estoque projetado = saldo atual − entregas pendentes entre hoje e o início da semana.
 */
export function buildProduction({ weekStart, today, plans, petsById, balances, reschedules, statusOf, dietsByPet = {}, anchor = DEFAULT_ANCHOR, shelf = [], snack = [] }) {
  const rodadaSemana = rodadaDaSemana(weekStart, anchor);
  const w1End = addDays(weekStart, 6), w2End = addDays(weekStart, 13), preEnd = addDays(weekStart, -1);

  const subs = plans.filter((p) => p.frequency !== "avulsa" && (!petsById[p.petId] || petsById[p.petId].ativo !== false));
  const auto = assignRounds(subs.map((p) => ({ petId: p.petId || p.id, rodada: petsById[p.petId]?.rodada || null, fixa: !!petsById[p.petId]?.rodada_fixa, weekly: unitsPerWeek(p) })));

  const pendingDates = (plan, a, b) =>
    a > b ? [] : getOccurrencesInRange(plan, a, b, reschedules[plan.id] || []).filter((d) => statusOf(plan.id, d) !== "entregue");

  const rows = [];
  for (const plan of subs) {
    const pet = petsById[plan.petId] || null;
    const rodada = pet?.rodada || auto[plan.petId || plan.id] || "A";
    const u = plan.units || 0;
    const min = plan.minStock ?? pet?.min_stock ?? u;
    const balance = balances[plan.id] ?? 0;
    const committedDates = pendingDates(plan, today, preEnd);
    const week1 = pendingDates(plan, weekStart, w1End);
    const week2 = pendingDates(plan, addDays(weekStart, 7), w2End);
    const projected = balance - committedDates.length * u;
    const inRound = rodada === rodadaSemana;
    let produzir = 0, kind = "fora";
    if (inRound) {
      produzir = Math.max(0, (week1.length + week2.length) * u + min - projected); kind = "rodada";
    } else {
      const projEnd = projected - week1.length * u;
      if (projEnd < min) { produzir = min - projEnd; kind = "antecipado"; }
    }
    if (!inRound && kind === "fora") continue;
    const diets = (dietsByPet[plan.petId] || []).map((d) => ({ product_id: d.product_id, nome: d.nome, sku: d.sku, qtd_mensal: d.qtd_mensal }));
    rows.push({
      plan, pet, rodada, kind, balance, committed: committedDates.length * u, min, projected,
      demand: (week1.length + week2.length) * u, deliveriesWeek: week1, produzir,
      porDieta: allocateByDiet(produzir, diets),
    });
  }
  rows.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "antecipado" ? -1 : 1) || b.produzir - a.produzir || a.plan.dog.localeCompare(b.plan.dog));

  const dietMap = {};
  let semDieta = 0;
  for (const r of rows) {
    if (!r.produzir) continue;
    if (!r.porDieta.length) { semDieta += r.produzir; continue; }
    for (const d of r.porDieta) {
      const k = d.sku || d.nome;
      const e = dietMap[k] || (dietMap[k] = { sku: d.sku, nome: d.nome, qtd: 0, pets: 0 });
      e.qtd += d.qtd; e.pets++;
    }
  }
  const byDiet = Object.values(dietMap).sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome));
  const low = (arr) => arr.filter((p) => (p.min_stock || 0) > 0 && p.balance < p.min_stock).map((p) => ({ name: p.name, balance: p.balance, min: p.min_stock, produzir: p.min_stock - p.balance }));
  const total = rows.reduce((s, r) => s + r.produzir, 0);
  return {
    weekStart, weekEnd: w1End, rodada: rodadaSemana, rows, byDiet, semDieta, total,
    pets: rows.filter((r) => r.produzir > 0).length, antecipados: rows.filter((r) => r.kind === "antecipado" && r.produzir > 0).length,
    lowShelf: low(shelf), lowSnack: low(snack),
    volumeA: rows.filter((r) => r.rodada === "A").reduce((s, r) => s + r.produzir, 0),
    volumeB: rows.filter((r) => r.rodada === "B").reduce((s, r) => s + r.produzir, 0),
  };
}

export function buildProductionText(p) {
  const L = [`*Produção ObentōPet — Rodada ${p.rodada} · semana ${formatDateBR(p.weekStart)} a ${formatDateBR(p.weekEnd)}*`,
    `Total a produzir: ${p.total} un. (${p.pets} pets${p.antecipados ? `, ${p.antecipados} antecipado(s)` : ""})`, ""];
  if (p.byDiet.length) { L.push("*Por dieta*"); p.byDiet.forEach((d) => L.push(`• ${d.nome}${d.sku ? ` (${d.sku})` : ""}: ${d.qtd} un.`)); if (p.semDieta) L.push(`• Sem dieta definida: ${p.semDieta} un.`); L.push(""); }
  L.push("*Por pet*");
  p.rows.filter((r) => r.produzir > 0).forEach((r, i) => {
    const dd = r.porDieta.length ? " — " + r.porDieta.map((d) => `${d.qtd}× ${d.nome}`).join(", ") : "";
    L.push(`${i + 1}. ${r.plan.dog} (${r.plan.tutor}) — produzir ${r.produzir} un.${r.kind === "antecipado" ? " ⚠ antecipado" : ""}${dd}`);
  });
  if (p.lowShelf.length) { L.push("", "*Avulsos abaixo do mínimo*"); p.lowShelf.forEach((x) => L.push(`• ${x.name}: +${x.produzir}`)); }
  if (p.lowSnack.length) { L.push("", "*Petiscos abaixo do mínimo*"); p.lowSnack.forEach((x) => L.push(`• ${x.name}: +${x.produzir}`)); }
  return L.join("\n");
}

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function buildProductionHTML(p, emitidoEm) {
  const tbl = (head, rows) => `<table><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${rows}</table>`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Produção ${formatDateBR(p.weekStart)}</title>
<style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#3E332A;font-size:12px}h1{font-size:19px;margin:0 0 4px}h2{font-size:12px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.5px;color:#8A6A48}.sub{color:#8A7A6C;margin-bottom:8px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:5px 8px;text-align:left}th{background:#F6EEE3}td.n{text-align:right}.big{font-weight:700;color:#A8412F}tr{page-break-inside:avoid}</style></head><body>
<h1>Lista de produção — Rodada ${p.rodada}</h1><div class="sub">Semana ${formatDateBR(p.weekStart)} a ${formatDateBR(p.weekEnd)} · emitida em ${esc(emitidoEm || "")} · ${p.total} un. a produzir</div>
<h2>Resumo por dieta</h2>${tbl(["Dieta", "SKU", "Produzir"], p.byDiet.map((d) => `<tr><td>${esc(d.nome)}</td><td>${esc(d.sku || "")}</td><td class="n big">${d.qtd}</td></tr>`).join("") + (p.semDieta ? `<tr><td>Sem dieta definida</td><td></td><td class="n big">${p.semDieta}</td></tr>` : ""))}
<h2>Detalhe por pet</h2>${tbl(["Pet", "Tutor", "Entregas na semana", "Saldo", "Mín.", "Produzir", "Dietas"], p.rows.filter((r) => r.produzir > 0).map((r) => `<tr><td><b>${esc(r.plan.dog)}</b>${r.kind === "antecipado" ? " ⚠" : ""}</td><td>${esc(r.plan.tutor)}</td><td>${r.deliveriesWeek.map((d) => dowShort(d) + " " + formatDateBR(d)).join(", ") || "—"}</td><td class="n">${r.balance}</td><td class="n">${r.min}</td><td class="n big">${r.produzir}</td><td>${esc(r.porDieta.map((d) => d.qtd + "× " + d.nome).join(", "))}</td></tr>`).join(""))}
${p.lowShelf.length ? `<h2>Avulsos abaixo do mínimo</h2>${tbl(["Produto", "Saldo", "Mín", "Produzir"], p.lowShelf.map((x) => `<tr><td>${esc(x.name)}</td><td class="n">${x.balance}</td><td class="n">${x.min}</td><td class="n big">+${x.produzir}</td></tr>`).join(""))}` : ""}
${p.lowSnack.length ? `<h2>Petiscos abaixo do mínimo</h2>${tbl(["Petisco", "Saldo", "Mín", "Produzir"], p.lowSnack.map((x) => `<tr><td>${esc(x.name)}</td><td class="n">${x.balance}</td><td class="n">${x.min}</td><td class="n big">+${x.produzir}</td></tr>`).join(""))}` : ""}
</body></html>`;
}
