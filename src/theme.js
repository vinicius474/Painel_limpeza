export const SAUDE_MAP = {
  EM_DIA:   { color: "#34d399", bg: "#052e16", label: "Em dia",   icon: "✓" },
  CRITICO:  { color: "#f87171", bg: "#450a0a", label: "Crítico", icon: "✕" },
  ATRASADO: { color: "#fbbf24", bg: "#451a03", label: "Atrasado", icon: "⚠" },
};

export const STATUS_MAP = {
  NUNCA:    { color: "#f87171", bg: "rgba(248,113,113,0.08)" },
  OK:       { color: "#34d399", bg: "rgba(52,211,153,0.08)" },
  AVISO:    { color: "#fbbf24", bg: "rgba(251,191,36,0.08)" },
  ERRO:     { color: "#f87171", bg: "rgba(248,113,113,0.08)" },
  PENDENTE: { color: "#f87171", bg: "rgba(248,113,113,0.08)" },
};

export const CHART_COLORS = {
  saude:     ["#f87171", "#34d399", "#fbbf24"],
  categoria: ["#818cf8", "#a78bfa", "#c4b5fd", "#e9d5ff"],
  bar: {
    total:    "#818cf8",
    pendente: "#f87171",
  },
};
