// Sugestão de classificação do cliente a partir do histórico de pedidos
// assinante: tem plano recorrente | frequente: >=3 pedidos em 120 dias | esporádico: o resto
export function suggestClassification({ hasSubscription, ordersLast120d }) {
  if (hasSubscription) return "assinante";
  return ordersLast120d >= 3 ? "frequente" : "esporadico";
}
export const CLASS_LABEL = { assinante: "Assinante", frequente: "Cliente frequente", esporadico: "Cliente esporádico" };
export const CLASS_COLOR = {
  assinante: ["#3E7CB1", "#EAF2F8"],
  frequente: ["#5C8A5C", "#E8F3E8"],
  esporadico: ["#8A6A48", "#F6EEE3"],
};
