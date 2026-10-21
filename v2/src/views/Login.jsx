import { useState } from "react";
import { useAuth } from "../state/Auth.jsx";
import { Field } from "../components/ui.jsx";

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(""); try { await signIn(email.trim(), pw); } catch (x) { setErr(x.message); } setBusy(false); };
  return (
    <form className="login" onSubmit={go}>
      <h2 style={{ marginBottom: 0 }}>ObentōPet</h2><p className="muted">Gestão · acesso restrito</p>
      <Field label="E-mail"><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
      <Field label="Senha"><input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
      {err && <div className="err">{err}</div>}
      <button className="btn" style={{ width: "100%", marginTop: 14 }} disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
