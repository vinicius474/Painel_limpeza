import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { SAUDE_MAP, STATUS_MAP } from "./theme.js";

export function KpiCard({ label, value, sub, accent, delay = 0 }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.015)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 14,
        padding: "26px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        position: "relative",
        overflow: "hidden",
        animation: `slideUp 0.4s ease ${delay}ms both`,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: accent || "#818cf8",
        }}
      />
      <span
        style={{
          fontSize: 11,
          color: "#7f8ea3",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 38,
          fontWeight: 700,
          color: "#f0f4f8",
          lineHeight: 1,
          fontFamily: "'IBM Plex Mono', monospace",
        }}
      >
        {value}
      </span>
      {sub && <span style={{ fontSize: 12, color: "#5b6b80" }}>{sub}</span>}
    </div>
  );
}

export function SaudeBadge({ saude }) {
  const cfg = SAUDE_MAP[saude] || SAUDE_MAP.CRITICO;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: cfg.bg,
        color: cfg.color,
        padding: "4px 11px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.03em",
        border: `1px solid ${cfg.color}20`,
      }}
    >
      <span style={{ fontSize: 9 }}>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

export function StatusBadge({ status }) {
  const cfg = STATUS_MAP[status] || STATUS_MAP.NUNCA;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: cfg.bg,
        color: cfg.color,
        padding: "3px 10px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}

export function Donut({ data, colors, size = 110 }) {
  return (
    <ResponsiveContainer width={size} height={size}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={30}
          outerRadius={44}
          dataKey="value"
          stroke="none"
          animationDuration={800}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ConnectionIndicator({ source, lastUpdate, onRefresh }) {
  const isApi = source === "api";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={onRefresh}
        title="Atualizar agora"
        style={{
          background: "none",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          padding: "6px 8px",
          cursor: "pointer",
          color: "#7f8ea3",
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          transition: "all 0.15s",
        }}
      >
        &#x21BB;
      </button>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: isApi ? "#34d399" : "#fbbf24",
          boxShadow: isApi
            ? "0 0 6px #34d39960"
            : "0 0 6px #fbbf2460",
        }}
      />
      <span style={{ fontSize: 11, color: "#5b6b80" }}>
        {isApi ? "API conectada" : "Offline (fallback)"}
        {lastUpdate &&
          ` · ${lastUpdate.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}`}
      </span>
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080810",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "3px solid rgba(129,140,248,0.15)",
          borderTopColor: "#818cf8",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <span
        style={{
          color: "#5b6b80",
          fontSize: 13,
          fontFamily: "'IBM Plex Mono', monospace",
        }}
      >
        Carregando painel...
      </span>
    </div>
  );
}
