export const Modal = ({ title, onClose, children }) => (
  <div className="modal" onClick={onClose}><div onClick={(e) => e.stopPropagation()}>
    <div className="row" style={{ marginBottom: 8 }}><b className="grow">{title}</b><button className="btn ghost sm" onClick={onClose}>Fechar</button></div>
    {children}
  </div></div>
);
export const Field = ({ label, children }) => (<><label className="f">{label}</label>{children}</>);
export const Tabs = ({ tabs, value, onChange }) => (
  <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>)}</div>
);
export const Badge = ({ children, color }) => <span className="badge" style={color ? { background: color + "22", color } : null}>{children}</span>;
export const copyText = async (t, say) => { try { await navigator.clipboard.writeText(t); say?.("Copiado!"); } catch { say?.("Não foi possível copiar"); } };
