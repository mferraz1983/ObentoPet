import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { db } from "../lib/supabase.js";
import { useAuth } from "./Auth.jsx";
import { genId } from "../lib/dates.js";

const Ctx = createContext(null);
export const useData = () => useContext(Ctx);

const groupBy = (arr, k) => arr.reduce((m, x) => ((m[x[k]] ||= []).push(x), m), {});

// Converte linha de `clients` (plano de entrega) + pet + tutor no objeto usado pelas libs
function toPlan(c, pet, tutor) {
  return {
    id: c.id, petId: pet?.id || null, tutorId: tutor?.id || null,
    dog: pet?.nome || c.dog, tutor: tutor?.nome || c.tutor,
    address: tutor?.address || c.address, bairro: tutor?.bairro || c.bairro, complemento: tutor?.complemento || c.complemento,
    referencia: tutor?.referencia || c.referencia, janelaEntrega: tutor?.janela_entrega || c.janela_entrega,
    phone: tutor?.phone || c.phone, contatoAlt: tutor?.contato_alt || c.contato_alt, cep: tutor?.cep || c.cep,
    frequency: c.frequency, nextDate: c.next_date, units: c.units || 0, volumes: c.volumes || 0,
    notes: c.notes, minStock: c.min_stock,
  };
}

export function DataProvider({ children }) {
  const { isStaff, role } = useAuth();
  const [d, setD] = useState({ ready: false });
  const [toast, setToast] = useState(null);
  const say = (m) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const load = useCallback(async () => {
    const q = (t, s = "*") => db.from(t).select(s).limit(5000).then((r) => { if (r.error) throw r.error; return r.data; });
    const [clients, tutors, pets, diets, catalog, resch, avulsa, status, sub, shelf, snack, settings] = await Promise.all([
      q("clients"), q("tutors"), q("pets"), q("pet_diets"), q("catalog_products"), q("delivery_reschedules"),
      q("avulsa_orders"), q("status_log"), q("subscriber_stock"), q("shelf_products"), q("snack_products"), q("app_settings"),
    ]);
    setD({ ready: true, clients, tutors, pets, diets, catalog, resch, avulsa, status, sub, shelf, snack, settings });
  }, []);

  useEffect(() => { if (role) load().catch((e) => setD({ ready: true, error: e.message })); }, [role, load]);

  const derived = useMemo(() => {
    if (!d.ready || d.error) return {};
    const tutorsById = Object.fromEntries(d.tutors.map((t) => [t.id, t]));
    const petsById = Object.fromEntries(d.pets.map((p) => [p.id, p]));
    const petByClient = Object.fromEntries(d.pets.filter((p) => p.client_id).map((p) => [p.client_id, p]));
    const catById = Object.fromEntries(d.catalog.map((c) => [c.id, c]));
    const plans = d.clients.map((c) => { const pet = petByClient[c.id]; return toPlan(c, pet, pet && tutorsById[pet.tutor_id]); });
    const dietsByPet = {};
    for (const x of d.diets) (dietsByPet[x.pet_id] ||= []).push({ ...x, nome: catById[x.product_id]?.nome, sku: catById[x.product_id]?.sku });
    const reschedules = groupBy(d.resch, "client_id");
    const avulsaOrders = groupBy(d.avulsa, "client_id");
    const statusMap = Object.fromEntries(d.status.map((s) => [s.key, s.status]));
    const balances = Object.fromEntries(d.sub.map((s) => [s.client_id, s.balance]));
    const settings = Object.fromEntries(d.settings.map((s) => [s.key, s.value]));
    return { tutorsById, petsById, petByClient, catById, plans, dietsByPet, reschedules, avulsaOrders, statusMap, balances, settings,
      statusOf: (id, date) => statusMap[`${id}|${date}`] || "pendente" };
  }, [d]);

  const actions = {
    reload: load, say,
    async setStatus(planId, date, status) {
      const key = `${planId}|${date}`;
      const { error } = await db.from("status_log").upsert({ key, status });
      if (error) return say("Erro: " + error.message);
      setD((s) => ({ ...s, status: [...s.status.filter((x) => x.key !== key), { key, status }] }));
    },
    async reschedule(planId, original, next) {
      const row = { id: genId(), client_id: planId, original_date: original, new_date: next };
      const { error } = await db.from("delivery_reschedules").insert(row);
      if (error) return say("Erro: " + error.message);
      setD((s) => ({ ...s, resch: [...s.resch, row] }));
    },
    async save(table, row, key = "id") {
      const { data, error } = await db.from(table).upsert(row).select().single();
      if (error) { say("Erro: " + error.message); throw error; }
      await load(); return data;
    },
    async remove(table, col, val) {
      const { error } = await db.from(table).delete().eq(col, val);
      if (error) return say("Erro: " + error.message);
      await load();
    },
    async adjust(kind, id, delta) {
      const fn = { sub: "increment_subscriber_balance", shelf: "increment_shelf_balance", snack: "increment_snack_balance" }[kind];
      const arg = kind === "sub" ? { p_client_id: id, p_delta: delta } : { p_product_id: id, p_delta: delta };
      const { error } = await db.rpc(fn, arg);
      if (error) return say("Erro: " + error.message);
      await load();
    },
  };
  return <Ctx.Provider value={{ ...d, ...derived, ...actions, isStaff }}>{children}{toast && <div className="toast">{toast}</div>}</Ctx.Provider>;
}
