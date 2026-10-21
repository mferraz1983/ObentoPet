import { formatDateFull } from "./dates.js";

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Agrupa as entregas do dia em PARADAS: vários pets do mesmo tutor/endereço viram uma parada só.
export function groupStops(items) {
  const map = new Map();
  for (const it of items) {
    const c = it.client;
    const key = (c.tutorId || (c.tutor || "").toLowerCase()) + "|" + (c.address || "").toLowerCase();
    if (!map.has(key)) map.set(key, { key, tutor: c.tutor, address: c.address, complemento: c.complemento, bairro: c.bairro, referencia: c.referencia, janelaEntrega: c.janelaEntrega, phone: c.phone, contatoAlt: c.contatoAlt, notes: c.notes, pets: [], volumes: 0, units: 0 });
    const s = map.get(key);
    s.pets.push({ dog: c.dog, units: c.units, volumes: c.volumes, date: it.date, clientId: c.id });
    s.volumes += c.volumes || 0; s.units += c.units || 0;
    if (!s.notes && c.notes) s.notes = c.notes;
  }
  return [...map.values()];
}

export function buildRoteiroText(date, items, { statusOf } = {}) {
  const stops = groupStops(items);
  const L = [`*Roteiro ObentōPet — ${formatDateFull(date)}*`, `Total: ${stops.length} parada${stops.length !== 1 ? "s" : ""} · ${items.length} pet${items.length !== 1 ? "s" : ""}`, ""];
  stops.forEach((s, i) => {
    const names = s.pets.map((p) => p.dog).join(" & ");
    L.push(`${i + 1}. 🐾 *${names}* (${s.tutor})`);
    L.push(`   📍 ${s.address}${s.bairro ? " - " + s.bairro : ""}`);
    if (s.volumes || s.units) L.push(`   📦 ${s.volumes ? s.volumes + " vol." : ""}${s.volumes && s.units ? " · " : ""}${s.units ? s.units + " un." : ""}`);
    if (s.complemento) L.push(`   🏢 ${s.complemento}`);
    if (s.referencia) L.push(`   🧭 ${s.referencia}`);
    if (s.janelaEntrega) L.push(`   🕒 ${s.janelaEntrega}`);
    if (s.notes) L.push(`   📝 ${s.notes}`);
    if (s.phone) L.push(`   📱 ${s.phone}`);
    if (statusOf && s.pets.every((p) => statusOf(p.clientId, p.date) === "entregue")) L.push("   ✅ Entregue");
    L.push("");
  });
  return L.join("\n").trim();
}

export function buildRoteiroHTML(date, items) {
  const stops = groupStops(items);
  const label = formatDateFull(date);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Roteiro ${esc(label)}</title>
<style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#3E332A}h1{font-size:18px;margin-bottom:4px}.sub{font-size:13px;color:#8A7A6C;margin-bottom:16px}.card{border:1px solid #E8DDD0;border-radius:10px;padding:12px 14px;margin-bottom:10px;page-break-inside:avoid}.num{font-size:11px;font-weight:700;color:#B8825A;text-transform:uppercase;margin-bottom:3px}.dog{font-size:16px;font-weight:700}.tutor{font-size:13px;color:#8A7A6C}.addr{font-size:13px;margin-top:5px}.info{font-size:12px;color:#7A6C5E;margin-top:2px}.warn{color:#A8412F;font-weight:700}</style></head><body>
<h1>Roteiro ObentōPet</h1><p class="sub">${esc(label)} · ${stops.length} parada${stops.length !== 1 ? "s" : ""} · ${items.length} pet${items.length !== 1 ? "s" : ""}</p>
${stops.map((s, i) => `<div class="card"><div class="num">Parada ${i + 1}</div><div class="dog">🐾 ${esc(s.pets.map((p) => p.dog).join(" & "))}</div><div class="tutor">${esc(s.tutor)}</div><div class="addr">📍 ${esc(s.address)}${s.bairro ? " - " + esc(s.bairro) : ""}</div>${s.volumes || s.units ? `<div class="info">📦 ${s.volumes ? s.volumes + " vol." : ""}${s.volumes && s.units ? " · " : ""}${s.units ? s.units + " un." : ""}</div>` : ""}${s.complemento ? `<div class="info">🏢 ${esc(s.complemento)}</div>` : ""}${s.referencia ? `<div class="info">🧭 ${esc(s.referencia)}</div>` : ""}${s.janelaEntrega ? `<div class="info warn">🕒 ${esc(s.janelaEntrega)}</div>` : ""}${s.notes ? `<div class="info">📝 ${esc(s.notes)}</div>` : ""}${s.phone ? `<div class="info">📱 ${esc(s.phone)}</div>` : ""}</div>`).join("")}
</body></html>`;
}

// Impressão via iframe oculto (usada por roteiro, produção e etiquetas)
export function printHtmlDoc(html, { waitFonts = false } = {}) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;";
  document.body.appendChild(iframe);
  const w = iframe.contentWindow;
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => {
    const imgs = Array.from(w.document.images || []).map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = im.onerror = r; })));
    const fonts = waitFonts && w.document.fonts?.ready ? w.document.fonts.ready : Promise.resolve();
    const ready = Promise.race([Promise.all([fonts, ...imgs]), new Promise((r) => setTimeout(r, 3000))]);
    ready.then(() => setTimeout(() => {
      try { w.focus(); w.print(); } catch (e) { console.error("Erro ao imprimir:", e); }
      setTimeout(() => { try { iframe.remove(); } catch (e) { /* noop */ } }, 60000);
    }, 150));
  }, 200);
}
