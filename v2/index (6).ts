// Criação/gestão de usuários (somente admin). Usa service role no servidor — a chave nunca vai ao navegador.
import { createClient } from "npm:@supabase/supabase-js@2";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
Deno.serve(async (req) => {
  const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const { data: u } = await sb.auth.getUser(jwt);
  const { data: me } = u?.user ? await sb.from("profiles").select("role,ativo").eq("user_id", u.user.id).maybeSingle() : { data: null };
  if (!me || me.role !== "admin" || me.ativo === false) return json({ error: "não autorizado" }, 401);
  const b = await req.json().catch(() => ({}));
  if (b.action === "create") {
    if (!b.email || !b.nome || String(b.password || "").length < 10) return json({ error: "Informe nome, e-mail e senha com 10+ caracteres" }, 400);
    if (!["admin", "operacional", "portador"].includes(b.role)) return json({ error: "perfil inválido" }, 400);
    const { data, error } = await sb.auth.admin.createUser({ email: b.email, password: b.password, email_confirm: true });
    if (error) return json({ error: error.message }, 400);
    const { error: e2 } = await sb.from("profiles").upsert({ user_id: data.user.id, nome: b.nome, role: b.role, ativo: true });
    if (e2) return json({ error: e2.message }, 400);
    return json({ ok: true });
  }
  if (b.action === "reset_password") {
    if (String(b.password || "").length < 10) return json({ error: "senha curta" }, 400);
    const { error } = await sb.auth.admin.updateUserById(b.user_id, { password: b.password });
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }
  return json({ error: "ação inválida" }, 400);
});
