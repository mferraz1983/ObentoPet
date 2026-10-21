import { formatDateBR } from "./dates.js";
import { maskCep } from "./docs.js";
export { maskCep };

export const LABEL_LOGO_RATIO = 0.828; // largura / altura do logo
const LABEL_FONTS = "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;800&display=swap";
export const logoUrl = () => {
  try { return new URL((import.meta.env?.BASE_URL || "/") + "label-logo.png", window.location.origin).href; } catch { return ""; }
};
export const escHtml = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const LABEL_DEFAULTS = { w: 65, h: 30, showLogo: true, tutorFirstName: true, showObs: true, showCep: false, showPhone: false, showDate: false, copiesByVolumes: false, gap: 0, offsetY: 0 };
const LABEL_STORE_KEY = "obentopet_label_profiles_v3";

export function loadLabelStore() {
  try {
    const raw = localStorage.getItem(LABEL_STORE_KEY);
    if (raw) { const s = JSON.parse(raw); if (s && Array.isArray(s.profiles) && s.profiles.length) return s; }
  } catch (e) { /* sem storage */ }
  return { activeId: "default", profiles: [{ ...LABEL_DEFAULTS, id: "default", name: "Endereço 65×30 mm" }] };
}
export function saveLabelStore(s) { try { localStorage.setItem(LABEL_STORE_KEY, JSON.stringify(s)); } catch (e) { /* noop */ } }
export const activeLabelSettings = (s) => ({ ...LABEL_DEFAULTS, ...(s.profiles.find((x) => x.id === s.activeId) || s.profiles[0]) });
export const labelCopies = (c, o) => (o.copiesByVolumes && c.volumes > 1 ? c.volumes : 1);

function labelGeom(o) {
  const sc = Math.min(o.w / 65, o.h / 30);
  const pad = 1.8 * sc;
  const innerW = o.w - 2 * pad, innerH = o.h - 2 * pad;
  const logoH = o.showLogo ? innerH * 0.74 : 0;
  const logoW = logoH * LABEL_LOGO_RATIO;
  const gap = o.showLogo ? 2.5 * sc : 0;
  return { sc, pad, innerW, innerH, logoH, logoW, gap, txtW: innerW - logoW - gap };
}

export function buildLabelHTML(c, date, o, idx = 1, total = 1) {
  const g = labelGeom(o), sc = g.sc;
  const pet = (c.dog || "").toUpperCase().trim();
  const tutorRaw = (c.tutor || "").trim();
  const tutor = (o.tutorFirstName ? tutorRaw.split(/\s+/)[0] : tutorRaw).toUpperCase();
  const a1 = c.address || "";
  const a2 = [c.complemento, c.bairro].filter(Boolean).join(" - ");
  const a3 = o.showCep ? [c.cidade, c.cep].filter(Boolean).join(" · ") : "";
  const obsParts = o.showObs ? [c.janelaEntrega ? "Horário: " + c.janelaEntrega : "", c.referencia ? "Ref.: " + c.referencia : "", (c.notes || "").trim()].filter(Boolean) : [];
  const obs = obsParts.join(" | ");
  const bottomLeft = [o.showPhone && c.phone ? c.phone : "", o.showDate && date ? formatDateBR(date) : ""].filter(Boolean).join("  ·  ");
  const bottomRight = total > 1 ? "Vol. " + idx + "/" + total : "";
  const hasBottom = !!(bottomLeft || bottomRight);

  const nPet = Math.max(pet.length, 1);
  const petLs = nPet <= 8 ? 0.30 : nPet <= 12 ? 0.16 : 0.06;
  const petFs = Math.min(5.0 * sc, (g.txtW - 2.4 * sc) / (nPet * (0.70 + petLs)));
  const tutFs = Math.min(3.8 * sc, g.txtW / (Math.max(tutor.length, 1) * 0.76));
  const obsFs = 2.3 * sc;
  const obsCpl = g.txtW / (obsFs * 0.64);
  const obsWanted = obs ? Math.min(2, Math.ceil(obs.length / obsCpl)) : 0;
  const botFs = 2.2 * sc, botH = hasBottom ? botFs * 1.25 : 0;
  const petH = petFs * 1.0 + 1.0 * sc, tutH = tutFs * 1.15;
  const parts = [a1, a2, a3].filter(Boolean);
  const fitAddr = (obsLines) => {
    const oh = obs ? obsLines * obsFs * 1.2 + 1.2 * sc : 0;
    const addrMax = g.innerH - petH - tutH - oh - botH - 1.6 * sc;
    for (let fs = 3.0 * sc; fs >= 2.4 * sc - 0.001; fs -= 0.1 * sc) {
      const cpl = g.txtW / (fs * 0.56);
      if (parts.every((x) => x.length <= cpl) && parts.length * fs * 1.16 <= addrMax) return { fs, ok: true };
    }
    for (let fs = 3.0 * sc; fs >= 2.0 * sc - 0.001; fs -= 0.1 * sc) {
      const cpl = g.txtW / (fs * 0.60);
      const lines = parts.reduce((s, x) => s + Math.max(1, Math.ceil(x.length / cpl)), 0);
      if (lines * fs * 1.16 <= addrMax) return { fs, ok: true };
    }
    return { fs: 2.0 * sc, ok: false };
  };
  let obsLines = obsWanted;
  let fit = fitAddr(obsLines);
  if (!fit.ok && obsLines > 1) { obsLines = 1; fit = fitAddr(1); }
  const f = (n) => n.toFixed(2) + "mm";
  return `<div class="label">`
    + (o.showLogo ? `<div class="logo"></div>` : ``)
    + `<div class="txt">`
    + `<div class="pet" style="font-size:${f(petFs)};letter-spacing:${petLs}em">${escHtml(pet)}</div>`
    + `<div class="tutor" style="font-size:${f(tutFs)}">${escHtml(tutor)}</div>`
    + `<div class="addr" style="font-size:${f(fit.fs)}"><div>${escHtml(a1)}</div>${a2 ? `<div>${escHtml(a2)}</div>` : ""}${a3 ? `<div>${escHtml(a3)}</div>` : ""}</div>`
    + (obs ? `<div class="obs" style="font-size:${f(obsFs)}"><div class="obs-in" style="-webkit-line-clamp:${obsLines}"><b>OBS:</b> ${escHtml(obs)}</div></div>` : ``)
    + (hasBottom ? `<div class="bot" style="font-size:${f(botFs)}"><span>${escHtml(bottomLeft)}</span><span>${escHtml(bottomRight)}</span></div>` : ``)
    + `</div></div>`;
}

function labelsCss(o) {
  const g = labelGeom(o);
  const gap = Math.max(0, Number(o.gap) || 0), offY = Math.max(-10, Math.min(10, Number(o.offsetY) || 0));
  const pageH = (Number(o.h) + gap).toFixed(2);
  const padTop = Math.max(0, g.pad + offY).toFixed(2), padBot = Math.max(0, g.pad + gap - offY).toFixed(2), padX = g.pad.toFixed(2);
  return `@page{size:${o.w}mm ${pageH}mm;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
body{font-family:"Poppins","Montserrat","Segoe UI",Arial,sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.label{width:${o.w}mm;height:${pageH}mm;padding:${padTop}mm ${padX}mm ${padBot}mm ${padX}mm;display:flex;flex-direction:row;align-items:center;gap:${g.gap.toFixed(2)}mm;overflow:hidden;page-break-after:always;break-after:page}
.label:last-child{page-break-after:auto;break-after:auto}
.logo{flex:0 0 auto;width:${g.logoW.toFixed(2)}mm;height:${g.logoH.toFixed(2)}mm;background:url(${logoUrl()}) center/contain no-repeat}
.txt{flex:1 1 auto;min-width:0;height:100%;display:flex;flex-direction:column;justify-content:center;gap:${(0.5 * g.sc).toFixed(2)}mm;overflow:hidden}
.pet{display:inline-block;align-self:flex-start;max-width:100%;background:#000;color:#fff;font-weight:500;line-height:1.1;padding:0.25mm 1.2mm;white-space:nowrap;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.tutor{font-weight:600;line-height:1.12;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.addr{font-weight:400;line-height:1.16}
.addr div{overflow-wrap:anywhere}
.obs{border:0.25mm solid #000;border-radius:0.8mm;padding:0.2mm 0.8mm;overflow:hidden}
.obs-in{line-height:1.16;font-weight:600;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}
.bot{display:flex;justify-content:space-between;gap:2mm;font-weight:600;white-space:nowrap}`;
}
export function labelDoc(bodyHtml, o) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Etiquetas ObentōPet</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="${LABEL_FONTS}" rel="stylesheet"><style>${labelsCss(o)}</style></head><body>${bodyHtml}</body></html>`;
}
export function labelPagesHTML(items, settings) {
  const o = { ...LABEL_DEFAULTS, ...settings };
  const pages = [];
  items.forEach(({ client, date }) => {
    const n = labelCopies(client, o);
    for (let i = 1; i <= n; i++) pages.push(buildLabelHTML(client, date, o, i, n));
  });
  return { html: labelDoc(pages.join(""), o), count: pages.length };
}

export const normLabel = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s-]/g, "").trim();
