import { useMemo, useState } from "react";
import { useData } from "../state/Data.jsx";
import { useAuth } from "../state/Auth.jsx";
import { db, callFn } from "../lib/supabase.js";
import { Modal, Field, Tabs, Badge } from "../components/ui.jsx";
import { CLASS_LABEL, CLASS_COLOR } from "../lib/classify.js";
import { maskCpfCnpj, maskPhone, maskCep, validDoc, onlyDigits } from "../lib/docs.js";
import { ageLabel } from "../lib/birthdays.js";
import { genId } from "../lib/dates.js";

const emptyTutor = { nome: "", phone: "", email: "", address: "", cep: "", bairro: "", cidade: "São Paulo", complemento: "", referencia: "", janela_entrega: "", classificacao: "esporadico", notes: "" };

export default function Clientes() {
  const D = useData();
  const [q, setQ] = useState(""), [cls, setCls] = useState("todos"), [open, setOpen] = useState(null);
  const list = useMemo(() => D.tutors
    .filter((t) => (cls === "todos" || t.classificacao === cls) && (t.nome + " " + D.pets.filter((p) => p.tutor_id === t.id).map((p) => p.nome).join(" ")).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.nome.localeCompare(b.nome)), [D, q, cls]);
  return (<>
    <div className="row" style={{ marginBottom: 10 }}>
      <input className="grow" placeholder="Buscar tutor ou pet…" value={q} onChange={(e) => setQ(e.target.value)} />
      <button className="btn" onClick={() => setOpen({ ...emptyTutor })}>+ Novo</button>
    </div>
    <Tabs value={cls} onChange={setCls} tabs={[["todos", "Todos"], ...Object.entries(CLASS_LABEL)]} />
    {list.map((t) => { const pets = D.pets.filter((p) => p.tutor_id === t.id); return (
      <div key={t.id} className="card" onClick={() => setOpen(t)} style={{ cursor: "pointer" }}>
        <div className="row"><b className="grow">{t.nome}</b>
          <span className="badge" style={{ background: CLASS_COLOR[t.classificacao]?.[1], color: CLASS_COLOR[t.classificacao]?.[0] }}>{CLASS_LABEL[t.classificacao] || "—"}</span></div>
        <div className="muted">🐾 {pets.map((p) => p.nome).join(", ") || "sem pets"} · {t.bairro || t.address}</div>
      </div>); })}
    {open && <TutorCard tutor={open} onClose={() => setOpen(null)} />}
  </>);
}

function TutorCard({ tutor, onClose }) {
  const D = useData();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState("cliente");
  const [t, setT] = useState(tutor);
  const [doc, setDoc] = useState(""), [docLoaded, setDocLoaded] = useState(false), [busy, setBusy] = useState("");
  const set = (k, v) => setT((x) => ({ ...x, [k]: v }));
  const isNew = !t.id;
  const pets = isNew ? [] : D.pets.filter((p) => p.tutor_id === t.id);

  const revealDoc = async () => {
    const { data } = await db.from("tutor_documents").select("cpf_cnpj").eq("tutor_id", t.id).maybeSingle();
    setDoc(maskCpfCnpj(data?.cpf_cnpj || "")); setDocLoaded(true);
  };
  const save = async () => {
    if (!t.nome.trim()) return D.say("Informe o nome");
    if (doc && !validDoc(doc)) return D.say("CPF/CNPJ inválido");
    setBusy("save");
    try {
      const row = { ...t, id: t.id || crypto.randomUUID(), tipo_pessoa: onlyDigits(doc).length === 14 ? "J" : "F" };
      await D.save("tutors", row);
      if (isAdmin && (docLoaded || doc)) await D.save("tutor_documents", { tutor_id: row.id, cpf_cnpj: onlyDigits(doc) });
      setT(row); D.say("Salvo");
    } finally { setBusy(""); }
  };
  const syncBling = async () => {
    setBusy("bling");
    try { const r = await callFn("bling-sync", { action: "contact", tutor_id: t.id }); await D.reload(); D.say(r?.message || "Sincronizado com o Bling"); }
    catch (e) { D.say("Bling: " + e.message); }
    setBusy("");
  };
  return (
    <Modal title={t.nome || "Novo cliente"} onClose={onClose}>
      <Tabs value={tab} onChange={setTab} tabs={[["cliente", "CLIENTE"], ["pet", `PET (${pets.length})`]]} />
      {tab === "cliente" ? (<>
        <Field label="Nome"><input value={t.nome} onChange={(e) => set("nome", e.target.value)} /></Field>
        {isAdmin && <Field label="CPF / CNPJ (somente administradores)">
          {docLoaded || isNew ? <input inputMode="numeric" value={doc} onChange={(e) => setDoc(maskCpfCnpj(e.target.value))} placeholder="000.000.000-00" />
            : <button className="btn ghost sm" onClick={revealDoc}>Mostrar documento</button>}
        </Field>}
        <Field label="Classificação"><select value={t.classificacao || "esporadico"} onChange={(e) => set("classificacao", e.target.value)}>
          {Object.entries(CLASS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <div className="grid2">
          <div><Field label="Telefone / WhatsApp"><input inputMode="tel" value={t.phone || ""} onChange={(e) => set("phone", maskPhone(e.target.value))} /></Field></div>
          <div><Field label="E-mail"><input type="email" value={t.email || ""} onChange={(e) => set("email", e.target.value)} /></Field></div>
        </div>
        <Field label="Endereço"><input value={t.address || ""} onChange={(e) => set("address", e.target.value)} /></Field>
        <div className="grid2">
          <div><Field label="CEP"><input inputMode="numeric" value={t.cep || ""} onChange={(e) => set("cep", maskCep(e.target.value))} /></Field></div>
          <div><Field label="Bairro"><input value={t.bairro || ""} onChange={(e) => set("bairro", e.target.value)} /></Field></div>
        </div>
        <Field label="Complemento"><input value={t.complemento || ""} onChange={(e) => set("complemento", e.target.value)} /></Field>
        <Field label="Referência"><input value={t.referencia || ""} onChange={(e) => set("referencia", e.target.value)} /></Field>
        <Field label="Janela de entrega"><input value={t.janela_entrega || ""} onChange={(e) => set("janela_entrega", e.target.value)} placeholder="ex.: 14h–18h" /></Field>
        <Field label="Observações"><textarea rows={2} value={t.notes || ""} onChange={(e) => set("notes", e.target.value)} /></Field>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" disabled={busy} onClick={save}>{busy === "save" ? "Salvando…" : "Salvar"}</button>
          {isAdmin && !isNew && <button className="btn ghost" disabled={busy} onClick={syncBling}>{busy === "bling" ? "Buscando…" : "Atualizar do Bling"}</button>}
        </div>
      </>) : isNew ? <p className="muted">Salve o cliente antes de cadastrar pets.</p> : <Pets tutor={t} pets={pets} />}
    </Modal>
  );
}

function Pets({ tutor, pets }) {
  const D = useData();
  const [edit, setEdit] = useState(null);
  return (<>
    {pets.map((p) => (
      <div key={p.id} className="card" onClick={() => setEdit(p)} style={{ cursor: "pointer" }}>
        <b>{p.nome}</b> <span className="muted">{p.nascimento ? "· " + ageLabel(p.nascimento) : ""}</span>
        <div className="muted">{(D.dietsByPet[p.id] || []).map((d) => `${d.nome || "?"} (${d.qtd_mensal}/mês)`).join(" · ") || "sem dietas"}</div>
      </div>))}
    <button className="btn" onClick={() => setEdit({ nome: "", tutor_id: tutor.id, especie: "cão", ativo: true })}>+ Adicionar pet</button>
    {edit && <PetForm pet={edit} onClose={() => setEdit(null)} />}
  </>);
}

function PetForm({ pet, onClose }) {
  const D = useData();
  const [p, setP] = useState(pet);
  const [diets, setDiets] = useState((D.dietsByPet[pet.id] || []).map((d) => ({ product_id: d.product_id, qtd_mensal: d.qtd_mensal })));
  const plan = pet.client_id ? D.clients.find((c) => c.id === pet.client_id) : null;
  const [pl, setPl] = useState(plan || { frequency: "semanal", units: 0, next_date: "", volumes: 1, min_stock: 0 });
  const catalog = D.catalog.filter((c) => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome));
  const save = async () => {
    if (!p.nome.trim()) return D.say("Informe o nome do pet");
    const id = p.id || crypto.randomUUID();
    let clientId = p.client_id || null;
    if (pl.units || pl.next_date) {
      clientId = clientId || "c" + genId();
      const tutor = D.tutorsById[p.tutor_id];
      await D.save("clients", { ...pl, id: clientId, tutor: tutor.nome, dog: p.nome, address: tutor.address || "" });
    }
    await D.save("pets", { ...p, id, client_id: clientId, nascimento: p.nascimento || null, min_stock: pl.min_stock || p.min_stock || null });
    await db.from("pet_diets").delete().eq("pet_id", id);
    const rows = diets.filter((d) => d.product_id && d.qtd_mensal > 0).map((d) => ({ pet_id: id, product_id: d.product_id, qtd_mensal: Number(d.qtd_mensal) }));
    if (rows.length) { const { error } = await db.from("pet_diets").insert(rows); if (error) return D.say(error.message); }
    await D.reload(); D.say("Pet salvo"); onClose();
  };
  const fetchBling = async () => {
    try { const r = await callFn("bling-sync", { action: "pet_diets", pet_id: p.id }); await D.reload(); D.say(r?.message || "Dietas atualizadas"); onClose(); }
    catch (e) { D.say("Bling: " + e.message); }
  };
  return (
    <Modal title={p.nome || "Novo pet"} onClose={onClose}>
      <Field label="Nome"><input value={p.nome} onChange={(e) => setP({ ...p, nome: e.target.value })} /></Field>
      <Field label="Aniversário"><input type="date" value={p.nascimento || ""} onChange={(e) => setP({ ...p, nascimento: e.target.value })} /></Field>
      <Field label="Restrições / alergias"><input value={p.restricoes || ""} onChange={(e) => setP({ ...p, restricoes: e.target.value })} /></Field>
      <h4>Plano de entrega</h4>
      <div className="grid2">
        <div><Field label="Frequência"><select value={pl.frequency} onChange={(e) => setPl({ ...pl, frequency: e.target.value })}>
          {["semanal", "quinzenal", "mensal", "avulsa"].map((f) => <option key={f}>{f}</option>)}</select></Field></div>
        <div><Field label="Próxima entrega"><input type="date" value={pl.next_date || ""} onChange={(e) => setPl({ ...pl, next_date: e.target.value })} /></Field></div>
        <div><Field label="Unidades/entrega"><input type="number" value={pl.units || 0} onChange={(e) => setPl({ ...pl, units: +e.target.value })} /></Field></div>
        <div><Field label="Estoque mínimo"><input type="number" value={pl.min_stock || 0} onChange={(e) => setPl({ ...pl, min_stock: +e.target.value })} /></Field></div>
      </div>
      <h4>Dietas e quantidade mensal</h4>
      {diets.map((d, i) => (
        <div key={i} className="row" style={{ marginBottom: 6 }}>
          <select className="grow" value={d.product_id} onChange={(e) => setDiets(diets.map((x, j) => (j === i ? { ...x, product_id: e.target.value } : x)))}>
            <option value="">Escolher dieta…</option>{catalog.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.sku ? ` · ${c.sku}` : ""}</option>)}</select>
          <input style={{ width: 70 }} type="number" value={d.qtd_mensal} onChange={(e) => setDiets(diets.map((x, j) => (j === i ? { ...x, qtd_mensal: e.target.value } : x)))} />
          <button className="btn ghost sm" onClick={() => setDiets(diets.filter((_, j) => j !== i))}>✕</button>
        </div>))}
      <div className="row"><button className="btn ghost sm" onClick={() => setDiets([...diets, { product_id: "", qtd_mensal: 0 }])}>+ dieta</button>
        {p.id && <button className="btn ghost sm" onClick={fetchBling}>Puxar do Bling</button>}</div>
      <div className="row" style={{ marginTop: 14 }}><button className="btn" onClick={save}>Salvar pet</button>
        {p.id && <button className="btn bad" onClick={async () => { if (confirm("Inativar este pet?")) { await D.save("pets", { ...p, ativo: false }); onClose(); } }}>Inativar</button>}</div>
    </Modal>
  );
}
