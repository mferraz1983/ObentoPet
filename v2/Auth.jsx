import { createContext, useContext, useEffect, useState } from "react";
import { db } from "../lib/supabase.js";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = db.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); return; }
    db.from("profiles").select("*").eq("user_id", session.user.id).maybeSingle().then(({ data }) => setProfile(data || { role: null }));
  }, [session]);

  const signIn = async (email, password) => {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw new Error("E-mail ou senha inválidos");
  };
  const signOut = () => db.auth.signOut();
  const role = profile?.ativo === false ? null : profile?.role || null;
  return <Ctx.Provider value={{ session, profile, role, loading: session === undefined || (session && !profile), signIn, signOut,
    isAdmin: role === "admin", isStaff: role === "admin" || role === "operacional" }}>{children}</Ctx.Provider>;
}
