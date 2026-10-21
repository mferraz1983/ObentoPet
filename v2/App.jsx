import { useState } from "react";
import { useAuth } from "./state/Auth.jsx";
import { DataProvider, useData } from "./state/Data.jsx";
import Login from "./views/Login.jsx";
import Hoje from "./views/Hoje.jsx";
import Entregas from "./views/Entregas.jsx";
import Clientes from "./views/Clientes.jsx";
import Produtos from "./views/Produtos.jsx";
import Admin from "./views/Admin.jsx";

const ALL = [["hoje", "Hoje", "🏠"], ["entregas", "Entregas", "🚚"], ["clientes", "Clientes", "🐶"], ["produtos", "Produtos", "📦"], ["admin", "Admin", "⚙️"]];
const ALLOWED = { admin: ["hoje", "entregas", "clientes", "produtos", "admin"], operacional: ["hoje", "entregas", "clientes", "produtos"], portador: ["hoje", "entregas"] };

function Shell() {
  const { role, profile, signOut } = useAuth();
  const D = useData();
  const tabs = ALL.filter(([k]) => ALLOWED[role].includes(k));
  const [view, setView] = useState("hoje");
  const View = { hoje: Hoje, entregas: Entregas, clientes: Clientes, produtos: Produtos, admin: Admin }[view];
  return (
    <div className="app">
      <div className="top"><b>ObentōPet</b><span><small>{profile?.nome} · {role} </small><button className="btn ghost sm" onClick={signOut}>Sair</button></span></div>
      <div className="main">{!D.ready ? <p className="muted">Carregando…</p> : D.error ? <p className="err">Erro: {D.error}</p> : <View go={setView} />}</div>
      <div className="nav"><div>{tabs.map(([k, l, i]) => <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}><span className="i">{i}</span>{l}</button>)}</div></div>
    </div>
  );
}

export default function App() {
  const { session, role, loading, signOut } = useAuth();
  if (loading) return <p className="muted" style={{ padding: 24 }}>Carregando…</p>;
  if (!session) return <Login />;
  if (!role) return (
    <div className="login"><h3>Acesso pendente</h3><p className="muted">Sua conta ainda não tem perfil. Peça a um administrador para liberar o acesso.</p>
      <button className="btn ghost" onClick={signOut}>Sair</button></div>);
  return <DataProvider><Shell /></DataProvider>;
}
