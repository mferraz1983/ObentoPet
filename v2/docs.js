export const onlyDigits = (s) => String(s || "").replace(/\D/g, "");
export function maskCpfCnpj(v) {
  const d = onlyDigits(v).slice(0, 14);
  if (d.length <= 11)
    return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}
function validCpf(c) {
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (let t = 9; t < 11; t++) {
    let s = 0; for (let i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(c[t])) return false;
  }
  return true;
}
function validCnpj(c) {
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (len) => { let s = 0, p = len - 7; for (let i = 0; i < len; i++) { s += Number(c[i]) * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}
export function docType(v) { const d = onlyDigits(v); return d.length === 11 ? "F" : d.length === 14 ? "J" : null; }
export function validDoc(v) { const d = onlyDigits(v); return d.length === 11 ? validCpf(d) : d.length === 14 ? validCnpj(d) : false; }
export const maskPhone = (v) => {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};
export const maskCep = (v) => { const d = onlyDigits(v).slice(0, 8); return d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d; };
