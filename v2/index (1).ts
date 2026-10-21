// Disparos automáticos via ManyChat: portadores (7h), clientes na véspera (17h), produção (sexta 14h).
// Chamado pelo pg_cron (header x-cron-secret) ou por um admin logado (teste/envio manual).
import { createClient } from "npm:@supabase/supabase-js@2";
// @ts-ignore libs puras compartilhadas com o app
import { addDays, formatDateFull, formatDateBR, weekStartOf } from "./dates.js";
// @ts-ignore
import { getDeliveriesForRange } from "./schedule.js";
// @ts-ignore
import { buildProduction, buildProductionText } from "./production.js";
// @ts-ignore
import { buildRoteiroText, groupStops } from "./roteiro.js";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MC = "https://api.manychat.com/fb";
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

const todayBR = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const e164 = (p: string) => { const d = String(p || "").replace(/\D/g, ""); return d ? "+" + (d.startsWith("55") ? d : "55" + d) : ""; };

async function mc(path: string, body?: unknown, method = body ? "POST" : "GET") {
  const r = await fetch(MC + path, { method, headers: { Authorization: `Bearer ${Deno.env.get("MANYCHAT_API_KEY")}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.status === "error") throw new Error(j.message || `ManyChat ${r.status}`);
  return j;
}
async function findSub(phone: string) {
  for (const key of ["phone", "whatsapp_phone"]) {
    try { const j = await mc(`/subscriber/findBySystemField?${key}=${encodeURIComponent(phone)}`); if (j.data?.id) return j.data.id as number; } catch { /* tenta o próximo */ }
  }
  return null;
}
// 1) texto direto (vale dentro da janela de 24h); 2) fora da janela, grava o texto num campo e dispara o fluxo com template aprovado
async function send(phone: string, text: string, flowNs?: string) {
  const id = await findSub(e164(phone));
  if (!id) throw new Error("contato não encontrado no ManyChat");
  try {
    await mc("/sending/sendContent", { subscriber_id: id, data: { version: "v2", content: { type: "whatsapp", messages: [{ type: "text", text }] } } });
    return "texto";
  } catch (e) {
    if (!flowNs) throw e;
    await mc("/subscriber/setCustomFieldByName", { subscriber_id: id, field_name: "obentopet_msg", field_value: text.replace(/\n+/g, " ⏎ ").slice(0, 1000) });
    await mc("/sending/sendFlow", { subscriber_id: id, flow_ns: flowNs });
    return "fluxo";
  }
}
async function log(kind: string, target: string, ref: string, status: string, detail = "") {
  await sb.from("notification_log").insert({ kind, target, ref_date: ref, status, detail: detail.slice(0, 300) });
}
async function already(kind: string, target: string, ref: string) {
  const { data } = await sb.from("notification_log").select("id").eq("kind", kind).eq("target", target).eq("ref_date", ref).eq("status", "ok").limit(1);
  return !!data?.length;
}

async function loadAll() {
  const t = async (n: string) => (await sb.from(n).select("*").limit(5000)).data || [];
  const [clients, tutors, pets, diets, catalog, resch, avulsa, status, sub, shelf, snack, settings] = await Promise.all(
    ["clients", "tutors", "pets", "pet_diets", "catalog_products", "delivery_reschedules", "avulsa_orders", "status_log", "subscriber_stock", "shelf_products", "snack_products", "app_settings"].map(t));
  const tutorsById = Object.fromEntries(tutors.map((x: any) => [x.id, x]));
  const petsById = Object.fromEntries(pets.map((x: any) => [x.id, x]));
  const petByClient = Object.fromEntries(pets.filter((p: any) => p.client_id).map((p: any) => [p.client_id, p]));
  const catById = Object.fromEntries(catalog.map((x: any) => [x.id, x]));
  const plans = clients.map((c: any) => {
    const pet = petByClient[c.id], tu = pet && tutorsById[pet.tutor_id];
    return { id: c.id, petId: pet?.id || null, tutorId: tu?.id || null, dog: pet?.nome || c.dog, tutor: tu?.nome || c.tutor, address: tu?.address || c.address,
      bairro: tu?.bairro || c.bairro, complemento: tu?.complemento || c.complemento, referencia: tu?.referencia || c.referencia, janelaEntrega: tu?.janela_entrega || c.janela_entrega,
      phone: tu?.phone || c.phone, contatoAlt: tu?.contato_alt || c.contato_alt, frequency: c.frequency, nextDate: c.next_date, units: c.units || 0, volumes: c.volumes || 0, notes: c.notes, minStock: c.min_stock };
  });
  const group = (a: any[], k: string) => a.reduce((m: any, x: any) => ((m[x[k]] ||= []).push(x), m), {});
  const dietsByPet: any = {};
  for (const x of diets) (dietsByPet[x.pet_id] ||= []).push({ ...x, nome: catById[x.product_id]?.nome, sku: catById[x.product_id]?.sku });
  const statusMap = Object.fromEntries(status.map((s: any) => [s.key, s.status]));
  return { plans, petsById, dietsByPet, reschedules: group(resch, "client_id"), avulsaOrders: group(avulsa, "client_id"),
    statusOf: (id: string, d: string) => statusMap[`${id}|${d}`] || "pendente", balances: Object.fromEntries(sub.map((s: any) => [s.client_id, s.balance])),
    shelf, snack, settings: Object.fromEntries(settings.map((s: any) => [s.key, s.value])) };
}

Deno.serve(async (req) => {
  // autorização: segredo do cron OU admin logado
  const cron = req.headers.get("x-cron-secret");
  let manual = false;
  if (cron && cron === Deno.env.get("CRON_SECRET")) { /* ok */ } else {
    const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "");
    const { data: u } = await sb.auth.getUser(jwt);
    const { data: p } = u?.user ? await sb.from("profiles").select("role,ativo").eq("user_id", u.user.id).maybeSingle() : { data: null };
    if (!p || p.role !== "admin" || p.ativo === false) return json({ error: "não autorizado" }, 401);
    manual = true;
  }
  const body = await req.json().catch(() => ({}));
  const dry = !!body.dryRun;
  const D = await loadAll();
  const S = D.settings as any;
  const today = todayBR();
  const kinds: string[] = body.kind ? [body.kind] : manual ? ["couriers", "customers", "production"] : [];
  const out: string[] = [];

  for (const kind of kinds) {
    try {
      if (kind === "couriers") {
        if (!manual && !S.dispatch_couriers_enabled) continue;
        const items = getDeliveriesForRange(D.plans, D.reschedules, D.avulsaOrders, today, today);
        const text = items.length ? buildRoteiroText(today, items, {}) : `Roteiro ObentōPet — ${formatDateFull(today)}\nSem entregas hoje.`;
        for (const ph of S.couriers || []) {
          if (!dry && await already("courier", ph, today)) { out.push(`portador ${ph}: já enviado`); continue; }
          if (dry) { out.push(`[teste] portador ${ph}: ${items.length} entregas`); continue; }
          try { const how = await send(ph, text, S.flow_ns_couriers); await log("courier", ph, today, "ok", how); out.push(`portador ${ph}: ok`); }
          catch (e) { await log("courier", ph, today, "erro", String(e.message)); out.push(`portador ${ph}: ERRO ${e.message}`); }
        }
      }
      if (kind === "customers") {
        if (!manual && !S.notify_customers_enabled) continue;
        const date = addDays(today, 1);
        const stops = groupStops(getDeliveriesForRange(D.plans, D.reschedules, D.avulsaOrders, date, date));
        const hours = S.business_hours || "";
        for (const s of stops) {
          if (!s.phone) { out.push(`${s.tutor}: sem telefone`); continue; }
          const pets = s.pets.map((p: any) => p.dog).join(" e ");
          const text = `Oi, ${String(s.tutor).split(" ")[0]}! Aqui é o Petto 🐾\nAmanhã, ${formatDateFull(date)}, entregamos a refeição ${s.pets.length > 1 ? "dos pets" : "do(a)"} ${pets} em ${s.address}${s.bairro ? " - " + s.bairro : ""}.` +
            (s.janelaEntrega || hours ? `\nHorário: ${s.janelaEntrega || hours}.` : "") + `\nSe precisar reagendar ou mudar o endereço, é só responder esta mensagem. 💛`;
          if (dry) { out.push(`[teste] ${s.tutor}: ${pets}`); continue; }
          if (await already("customer", s.phone, date)) continue;
          try { const how = await send(s.phone, text, S.flow_ns_customers); await log("customer", s.phone, date, "ok", how); out.push(`${s.tutor}: ok`); }
          catch (e) { await log("customer", s.phone, date, "erro", String(e.message)); out.push(`${s.tutor}: ERRO ${e.message}`); }
        }
      }
      if (kind === "production") {
        if (!manual && !S.friday_production_enabled) continue;
        const weekStart = weekStartOf(today, 1);
        const prod = buildProduction({ weekStart, today, plans: D.plans, petsById: D.petsById, balances: D.balances, reschedules: D.reschedules, statusOf: D.statusOf,
          dietsByPet: D.dietsByPet, anchor: S.production_anchor || undefined, shelf: D.shelf, snack: D.snack });
        const to = S.production_recipient;
        if (!to) { out.push("produção: defina o contato que recebe"); continue; }
        if (dry) { out.push(`[teste] produção ${prod.rodada}: ${prod.total} un.`); continue; }
        if (!manual && await already("production", to, weekStart)) continue;
        try { const how = await send(to, buildProductionText(prod), S.flow_ns_production); await log("production", to, weekStart, "ok", how);
          await sb.from("production_runs").insert({ semana_inicio: weekStart, rodada: prod.rodada, payload: { total: prod.total, byDiet: prod.byDiet, pets: prod.pets } }); out.push(`produção ${prod.rodada}: ok`); }
        catch (e) { await log("production", to, weekStart, "erro", String(e.message)); out.push(`produção: ERRO ${e.message}`); }
      }
    } catch (e) { out.push(`${kind}: ERRO ${e.message}`); }
  }
  return json({ message: out.join(" | ") || "nada a enviar", results: out });
});
