// Integração Bling API v3 (somente admin). Tokens OAuth ficam na tabela bling_tokens (sem acesso pelo navegador).
import { createClient } from "npm:@supabase/supabase-js@2";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const API = "https://api.bling.com.br/Api/v3";
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const basic = () => "Basic " + btoa(`${Deno.env.get("BLING_CLIENT_ID")}:${Deno.env.get("BLING_CLIENT_SECRET")}`);

async function saveTokens(t: any) {
  await sb.from("bling_tokens").upsert({ id: 1, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(), updated_at: new Date().toISOString() });
}
async function token(): Promise<string> {
  const { data } = await sb.from("bling_tokens").select("*").eq("id", 1).maybeSingle();
  if (!data) throw new Error("Bling não autorizado ainda (use a ação oauth_code)");
  if (new Date(data.expires_at) > new Date()) return data.access_token;
  const r = await fetch(`${API}/oauth/token`, { method: "POST", headers: { Authorization: basic(), "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: data.refresh_token }) });
  const t = await r.json(); if (!r.ok) throw new Error("Falha ao renovar token do Bling");
  await saveTokens(t); return t.access_token;
}
async function bling(path: string) {
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${await token()}`, accept: "application/json" } });
  if (r.status === 429) throw new Error("Bling: limite de requisições, tente em instantes");
  if (!r.ok) throw new Error(`Bling ${r.status}`);
  return (await r.json()).data;
}

Deno.serve(async (req) => {
  const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const { data: u } = await sb.auth.getUser(jwt);
  const { data: me } = u?.user ? await sb.from("profiles").select("role,ativo").eq("user_id", u.user.id).maybeSingle() : { data: null };
  if (!me || me.role !== "admin" || me.ativo === false) return json({ error: "não autorizado" }, 401);
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "oauth_code") {
      const r = await fetch(`${API}/oauth/token`, { method: "POST", headers: { Authorization: basic(), "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: b.code }) });
      const t = await r.json(); if (!r.ok) throw new Error("Código inválido ou expirado");
      await saveTokens(t); return json({ message: "Bling autorizado" });
    }
    if (b.action === "catalog") {
      let n = 0;
      for (let page = 1; page <= 30; page++) {
        const list = await bling(`/produtos?pagina=${page}&limite=100&criterio=2&tipo=T`);
        if (!list?.length) break;
        const rows = list.filter((p: any) => p.id).map((p: any) => ({ bling_id: p.id, sku: p.codigo || null, nome: p.nome, preco: p.preco ?? null, ativo: p.situacao !== "I", updated_at: new Date().toISOString() }));
        const { error } = await sb.from("catalog_products").upsert(rows, { onConflict: "bling_id" });
        if (error) throw new Error(error.message);
        n += rows.length; if (list.length < 100) break;
      }
      return json({ message: `${n} produtos sincronizados do Bling` });
    }
    if (b.action === "contact") {
      const { data: tutor } = await sb.from("tutors").select("*").eq("id", b.tutor_id).single();
      const { data: doc } = await sb.from("tutor_documents").select("cpf_cnpj").eq("tutor_id", b.tutor_id).maybeSingle();
      if (!doc?.cpf_cnpj) throw new Error("Cadastre o CPF/CNPJ do cliente primeiro");
      const found = await bling(`/contatos?numeroDocumento=${doc.cpf_cnpj}`);
      if (!found?.length) throw new Error("Contato não encontrado no Bling para este CPF/CNPJ");
      const c = await bling(`/contatos/${found[0].id}`);
      const e = c.endereco?.geral || {};
      const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
      const orders = await bling(`/pedidos/vendas?idContato=${c.id}&dataInicial=${since}&limite=100`).catch(() => []);
      const { data: pets } = await sb.from("pets").select("client_id").eq("tutor_id", b.tutor_id);
      const ids = (pets || []).map((p: any) => p.client_id).filter(Boolean);
      const { data: plans } = ids.length ? await sb.from("clients").select("frequency").in("id", ids) : { data: [] };
      const hasSub = (plans || []).some((p: any) => p.frequency !== "avulsa");
      const cls = hasSub ? "assinante" : (orders?.length || 0) >= 3 ? "frequente" : "esporadico";
      const patch: any = { bling_contact_id: c.id, bling_synced_at: new Date().toISOString(), classificacao: cls, tipo_pessoa: c.tipo };
      if (c.email && !tutor.email) patch.email = c.email;
      if (!tutor.phone && (c.celular || c.telefone)) patch.phone = c.celular || c.telefone;
      if (!tutor.address && e.endereco) { patch.address = `${e.endereco}${e.numero ? ", " + e.numero : ""}`; patch.bairro = e.bairro; patch.cep = e.cep; patch.cidade = e.municipio; patch.complemento = e.complemento; }
      await sb.from("tutors").update(patch).eq("id", b.tutor_id);
      return json({ message: `Bling ok · classificação sugerida: ${cls} (${orders?.length || 0} pedidos em 120 dias)` });
    }
    if (b.action === "pet_diets") {
      const { data: pet } = await sb.from("pets").select("id,nome").eq("id", b.pet_id).single();
      const found = await bling(`/produtos?nome=${encodeURIComponent("Assinatura " + pet.nome)}&limite=10`);
      const comp = (found || []).find((p: any) => p.formato === "E" && p.nome.toLowerCase().includes(pet.nome.toLowerCase()));
      if (!comp) throw new Error(`Nenhuma "Assinatura ${pet.nome}" encontrada no Bling`);
      const det = await bling(`/produtos/${comp.id}`);
      const rows: any[] = [];
      for (const it of det.estrutura?.componentes || []) {
        const pid = it.produto?.id; if (!pid) continue;
        let { data: cat } = await sb.from("catalog_products").select("id").eq("bling_id", pid).maybeSingle();
        if (!cat) {
          const p = await bling(`/produtos/${pid}`);
          const ins = await sb.from("catalog_products").upsert({ bling_id: pid, sku: p.codigo || null, ean: p.gtin || null, nome: p.nome, preco: p.preco ?? null }, { onConflict: "bling_id" }).select("id").single();
          cat = ins.data;
        }
        if (cat) rows.push({ pet_id: pet.id, product_id: cat.id, qtd_mensal: Math.round(Number(it.quantidade) || 0) });
      }
      if (!rows.length) throw new Error("A composição não tem componentes");
      await sb.from("pet_diets").delete().eq("pet_id", pet.id);
      const { error } = await sb.from("pet_diets").insert(rows);
      if (error) throw new Error(error.message);
      return json({ message: `${rows.length} dieta(s) importadas de "${comp.nome}"` });
    }
    return json({ error: "ação inválida" }, 400);
  } catch (e) { return json({ error: (e as Error).message }, 400); }
});
