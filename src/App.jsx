import { useState, useMemo } from "react";
import { useApiData, normalize } from "./useApiData.js";
import { REFRESH_INTERVAL } from "./config.js";
import { useAuth } from "./AuthContext.jsx";
import {
  KpiCard,
  ConnectionIndicator,
  LoadingSkeleton,
} from "./components.jsx";

// --- Utilitários: 1ª e 3ª sexta do mês ---
function getScheduledFridays(year, month) {
  const d = new Date(year, month, 1);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  const first = new Date(d);
  d.setDate(d.getDate() + 14);
  const third = new Date(d);
  return [first, third];
}

function getMostRecentScheduled(today) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const todayStart = new Date(y, m, today.getDate());
  const prevM = m === 0 ? 11 : m - 1;
  const prevY = m === 0 ? y - 1 : y;
  const candidates = [
    ...getScheduledFridays(prevY, prevM),
    ...getScheduledFridays(y, m),
  ].filter((d) => d <= todayStart);
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

function getNextScheduled(today) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const todayStart = new Date(y, m, today.getDate());
  const nextM = m === 11 ? 0 : m + 1;
  const nextY = m === 11 ? y + 1 : y;
  const candidates = [
    ...getScheduledFridays(y, m),
    ...getScheduledFridays(nextY, nextM),
  ].filter((d) => d > todayStart);
  return candidates.length > 0 ? candidates[0] : null;
}

function getOccurrenceLabel(date) {
  if (!date) return "";
  const [first] = getScheduledFridays(date.getFullYear(), date.getMonth());
  return date.getTime() === first.getTime() ? "1ª" : "3ª";
}

function formatScheduledDate(date) {
  if (!date) return "—";
  return `${getOccurrenceLabel(date)} sexta · ${date.toLocaleDateString("pt-BR")}`;
}


function formatExecDateShort(str) {
  if (!str) return "—";
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return str.split(" ")[0]; // DD/MM/YYYY já formatado
}
// parseExecDate foi movida para useApiData.js e agora é pré-calculada em normalize()
// como d.execDate — sem regex extra por render.

// Compara apenas a parte da data (ignora horário e DST)
function dateOnOrAfter(execDate, refDate) {
  if (!execDate || !refDate) return false;
  const e = execDate.getFullYear() * 10000 + execDate.getMonth() * 100 + execDate.getDate();
  const r = refDate.getFullYear() * 10000 + refDate.getMonth() * 100 + refDate.getDate();
  return e >= r;
}

const COLUMNS = [
  { key: "hostname", label: "Hostname", sort: true },
  { key: "colaborador", label: "Colaborador", sort: true },
  { key: "localizacao", label: "Local", sort: true },
  { key: "categoria", label: "Tipo", sort: true },
  { key: "fabricante", label: "Fab.", sort: true },
  { key: "status_limpeza", label: "Período", sort: true },
  { key: "saude", label: "Resultado", sort: true },
  { key: "ultima_execucao", label: "Última exec.", sort: false },
  { key: "dias_desde_limpeza", label: "Dias", sort: true },
];

export default function App({ onAdminClick = null }) {
  const { session, logout } = useAuth();
  const { data: rawData, loading, error, lastUpdate, source, refresh } = useApiData(
    session?.token,
    logout
  );
  const [search, setSearch] = useState("");
  const [filterSaude, setFilterSaude] = useState("TODOS");
  const [filterLocal, setFilterLocal] = useState("TODOS");
  const [filterSemana, setFilterSemana] = useState("TODOS");

  // Datas programadas — computadas UMA VEZ no mount (new Date() sem memo recria a cada render)
  const today         = useMemo(() => new Date(), []);
  const lastScheduled = useMemo(() => getMostRecentScheduled(today), [today]);
  const nextScheduled = useMemo(() => getNextScheduled(today), [today]);
  const [selectedRow, setSelectedRow] = useState(null);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  const data = useMemo(
    () => rawData.map(normalize).filter((d) => d.colaborador && d.colaborador.trim()),
    [rawData]
  );
  const localizacoes = useMemo(
    () => ["TODOS", ...new Set(data.map((d) => d.localizacao).filter(Boolean))],
    [data]
  );

  const filtered = useMemo(() => {
    let r = data.filter((d) => {
      const q = search.toLowerCase();
      const ms =
        !search ||
        d.colaborador.toLowerCase().includes(q) ||
        d.hostname.toLowerCase().includes(q) ||
        d.localizacao.toLowerCase().includes(q) ||
        d.email.toLowerCase().includes(q);
      const mh = filterSaude === "TODOS" || d.saude === filterSaude;
      const ml = filterLocal === "TODOS" || d.localizacao === filterLocal;
      const mSemana =
        filterSemana === "TODOS"
          ? true
          : filterSemana === "RODARAM"
          ? dateOnOrAfter(d.execDate, lastScheduled)
          : !dateOnOrAfter(d.execDate, lastScheduled);
      return ms && mh && ml && mSemana;
    });
    if (sortCol) {
      r = [...r].sort((a, b) => {
        let va = a[sortCol],
          vb = b[sortCol];
        if (va == null) va = sortDir === "asc" ? "\uffff" : "";
        if (vb == null) vb = sortDir === "asc" ? "\uffff" : "";
        if (typeof va === "number" && typeof vb === "number")
          return sortDir === "asc" ? va - vb : vb - va;
        return sortDir === "asc"
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      });
    }
    return r;
  }, [data, search, filterSaude, filterLocal, filterSemana, sortCol, sortDir]);

  // --- Stats ---
  const stats = useMemo(() => {
    const total = data.length;
    // Nunca executado OU pendente = sem execução concluída
    const semExecucao = data.filter(
      (d) => d.status_limpeza === "NUNCA" || d.status_limpeza === "PENDENTE"
    ).length;
    return { total, semExecucao };
  }, [data]);


  const semanaExec = useMemo(() => {
    // Passagem única: d.execDate já está pré-parseado pelo normalize()
    const rodaram = [], naoRodaram = [];
    for (const d of data) {
      (dateOnOrAfter(d.execDate, lastScheduled) ? rodaram : naoRodaram).push(d);
    }
    const pct = data.length > 0 ? Math.round((rodaram.length / data.length) * 100) : 0;
    return { rodaram, naoRodaram, pct };
  }, [data, lastScheduled]);


  const handleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080810",
        color: "#d0d8e4",
        fontFamily: "'IBM Plex Sans','Segoe UI',system-ui,sans-serif",
      }}
    >
      {/* ---- HEADER ---- */}
      <header
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          padding: "18px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(255,255,255,0.008)",
          animation: "slideDown 0.3s ease both",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: "linear-gradient(135deg,#818cf8,#6366f1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
            }}
          >
            &#x1F9F9;
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                color: "#eef1f6",
                letterSpacing: "-0.02em",
              }}
            >
              Painel de Limpeza
            </h1>
            <span style={{ fontSize: 11, color: "#5b6b80" }}>
              Monitoramento em tempo real
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ConnectionIndicator
            source={source}
            lastUpdate={lastUpdate}
            onRefresh={refresh}
          />
          <span
            style={{
              fontSize: 10,
              background: session?.role === "admin"
                ? "rgba(129,140,248,0.1)"
                : "rgba(255,255,255,0.04)",
              color: session?.role === "admin" ? "#a5b4fc" : "#5b6b80",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 5,
              padding: "3px 8px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {session?.role}
          </span>
          {onAdminClick && (
            <button
              onClick={onAdminClick}
              title="Painel Administrativo"
              style={{
                background: "rgba(129,140,248,0.08)",
                border: "1px solid rgba(129,140,248,0.2)",
                borderRadius: 8,
                padding: "6px 11px",
                cursor: "pointer",
                color: "#818cf8",
                fontSize: 11,
                fontWeight: 600,
                transition: "all 0.15s",
              }}
            >
              ⚙ Admin
            </button>
          )}
          <button
            onClick={logout}
            title="Sair"
            style={{
              background: "none",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              padding: "6px 11px",
              cursor: "pointer",
              color: "#5b6b80",
              fontSize: 11,
              fontWeight: 600,
              transition: "all 0.15s",
            }}
          >
            Sair
          </button>
        </div>
      </header>

      <div style={{ padding: "22px 28px", maxWidth: 1440, margin: "0 auto" }}>
        {/* ---- ALERTA OFFLINE ---- */}
        {error && (
          <div
            style={{
              background: "rgba(251,191,36,0.06)",
              border: "1px solid rgba(251,191,36,0.15)",
              borderRadius: 10,
              padding: "10px 16px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 12,
              color: "#fbbf24",
              animation: "slideUp 0.3s ease both",
            }}
          >
            <span>&#x26A0;</span>
            <span>
              API offline ({error}). Exibindo dados de fallback.
            </span>
          </div>
        )}

        {/* ---- KPIs ---- */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 14,
            marginBottom: 24,
          }}
        >
          <KpiCard label="Total de PCs" value={stats.total} sub="Cadastrados" accent="#818cf8" delay={0} />
          <KpiCard
            label="Executaram no período"
            value={semanaExec.rodaram.length}
            sub={`${semanaExec.pct}% do parque`}
            accent="#34d399"
            delay={60}
          />
          <KpiCard
            label="Sem execução"
            value={stats.semExecucao}
            sub="Nunca executado ou pendente"
            accent="#f87171"
            delay={120}
          />
        </div>

        {/* ---- EXECUÇÃO PROGRAMADA ---- */}
        <div
          style={{
            background: "rgba(255,255,255,0.015)",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 14,
            padding: "18px 20px",
            marginBottom: 24,
            animation: "slideUp 0.4s ease 50ms both",
          }}
        >
          {/* Cabeçalho com datas programadas */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  fontSize: 11,
                  color: "#7f8ea3",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Execução programada
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: "#5b6b80",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 5,
                  padding: "2px 8px",
                }}
              >
                1ª e 3ª sexta do mês
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {lastScheduled && nextScheduled ? (
                <span
                  style={{
                    fontSize: 11,
                    color: "#7f8ea3",
                    fontFamily: "'IBM Plex Mono',monospace",
                    background: "rgba(129,140,248,0.07)",
                    border: "1px solid rgba(129,140,248,0.15)",
                    borderRadius: 6,
                    padding: "3px 10px",
                  }}
                  title="Janela de validação: registros desde a última sexta programada até a próxima"
                >
                  {lastScheduled.toLocaleDateString("pt-BR")}
                  &nbsp;→&nbsp;
                  {nextScheduled.toLocaleDateString("pt-BR")}
                </span>
              ) : lastScheduled ? (
                <span style={{ fontSize: 11, color: "#7f8ea3", fontFamily: "'IBM Plex Mono',monospace" }}>
                  desde {lastScheduled.toLocaleDateString("pt-BR")}
                </span>
              ) : null}
              {filterSemana !== "TODOS" && (
                <button
                  onClick={() => { setFilterSemana("TODOS"); setSelectedRow(null); }}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 5,
                    padding: "3px 9px",
                    color: "#7f8ea3",
                    fontSize: 10,
                    cursor: "pointer",
                  }}
                >
                  Limpar filtro ✕
                </button>
              )}
            </div>
          </div>

          {/* Barra de progresso */}
          <div style={{ marginBottom: 6 }}>
            <div
              style={{
                background: "rgba(255,255,255,0.05)",
                borderRadius: 4,
                height: 6,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${semanaExec.pct}%`,
                  height: "100%",
                  background:
                    semanaExec.pct >= 80
                      ? "linear-gradient(90deg,#34d399,#10b981)"
                      : semanaExec.pct >= 50
                      ? "linear-gradient(90deg,#fbbf24,#f59e0b)"
                      : "linear-gradient(90deg,#f87171,#ef4444)",
                  borderRadius: 4,
                  transition: "width 0.6s ease",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
              <span style={{ fontSize: 10, color: "#5b6b80" }}>
                {lastScheduled
                  ? `Desde ${lastScheduled.toLocaleDateString("pt-BR")}`
                  : "Sem execução agendada anterior"}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "'IBM Plex Mono',monospace",
                  color:
                    semanaExec.pct >= 80
                      ? "#34d399"
                      : semanaExec.pct >= 50
                      ? "#fbbf24"
                      : "#f87171",
                  fontWeight: 700,
                }}
              >
                {semanaExec.rodaram.length}/{data.length} &middot; {semanaExec.pct}%
              </span>
            </div>
          </div>

          {/* Dois painéis clicáveis */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            {/* Rodaram */}
            <div
              onClick={() => {
                setFilterSemana(filterSemana === "RODARAM" ? "TODOS" : "RODARAM");
                setSelectedRow(null);
              }}
              style={{
                background:
                  filterSemana === "RODARAM"
                    ? "rgba(52,211,153,0.1)"
                    : "rgba(52,211,153,0.04)",
                border:
                  filterSemana === "RODARAM"
                    ? "1px solid rgba(52,211,153,0.4)"
                    : "1px solid rgba(52,211,153,0.12)",
                borderRadius: 10,
                padding: "14px 16px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "#34d399",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  ✓ Executaram no período
                </span>
                <span
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    color: "#34d399",
                    fontFamily: "'IBM Plex Mono', monospace",
                    lineHeight: 1,
                  }}
                >
                  {semanaExec.rodaram.length}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {semanaExec.rodaram.slice(0, 12).map((d) => (
                  <span
                    key={d.asset_tag || d.hostname}
                    title={`${d.colaborador} · ${d.ultima_execucao}`}
                    style={{
                      fontSize: 9,
                      background: "rgba(52,211,153,0.1)",
                      color: "#34d399",
                      padding: "2px 7px",
                      borderRadius: 4,
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  >
                    {d.hostname}
                  </span>
                ))}
                {semanaExec.rodaram.length > 12 && (
                  <span style={{ fontSize: 9, color: "#5b6b80", padding: "2px 4px" }}>
                    +{semanaExec.rodaram.length - 12} mais
                  </span>
                )}
                {semanaExec.rodaram.length === 0 && (
                  <span style={{ fontSize: 11, color: "#5b6b80" }}>
                    Nenhum PC executou desde{" "}
                    {lastScheduled ? lastScheduled.toLocaleDateString("pt-BR") : "—"}
                  </span>
                )}
              </div>
            </div>

            {/* Não rodaram */}
            <div
              onClick={() => {
                setFilterSemana(filterSemana === "PENDENTES" ? "TODOS" : "PENDENTES");
                setSelectedRow(null);
              }}
              style={{
                background:
                  filterSemana === "PENDENTES"
                    ? "rgba(248,113,113,0.1)"
                    : "rgba(248,113,113,0.04)",
                border:
                  filterSemana === "PENDENTES"
                    ? "1px solid rgba(248,113,113,0.4)"
                    : "1px solid rgba(248,113,113,0.12)",
                borderRadius: 10,
                padding: "14px 16px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "#f87171",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  ✕ Não executaram no período
                </span>
                <span
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    color: "#f87171",
                    fontFamily: "'IBM Plex Mono', monospace",
                    lineHeight: 1,
                  }}
                >
                  {semanaExec.naoRodaram.length}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {semanaExec.naoRodaram.slice(0, 12).map((d) => (
                  <span
                    key={d.asset_tag || d.hostname}
                    title={
                      d.ultima_execucao
                        ? `${d.colaborador} · última: ${d.ultima_execucao}`
                        : `${d.colaborador} · nunca executado`
                    }
                    style={{
                      fontSize: 9,
                      background: "rgba(248,113,113,0.1)",
                      color: "#f87171",
                      padding: "2px 7px",
                      borderRadius: 4,
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  >
                    {d.hostname}
                  </span>
                ))}
                {semanaExec.naoRodaram.length > 12 && (
                  <span style={{ fontSize: 9, color: "#5b6b80", padding: "2px 4px" }}>
                    +{semanaExec.naoRodaram.length - 12} mais
                  </span>
                )}
                {semanaExec.naoRodaram.length === 0 && (
                  <span style={{ fontSize: 11, color: "#5b6b80" }}>Todos executaram!</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ---- FILTERS ---- */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 14,
            alignItems: "center",
            flexWrap: "wrap",
            animation: "slideUp 0.4s ease 350ms both",
          }}
        >
          <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 320 }}>
            <span
              style={{
                position: "absolute",
                left: 11,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#5b6b80",
                fontSize: 13,
              }}
            >
              &#x1F50D;
            </span>
            <input
              type="text"
              placeholder="Buscar nome, hostname, email, local..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedRow(null);
              }}
              style={{
                width: "100%",
                padding: "9px 12px 9px 34px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 9,
                color: "#d0d8e4",
                fontSize: 12,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            {[
              ["TODOS", "Todos"],
              ["CRITICO", "Crítico"],
              ["EM_DIA", "Em dia"],
            ].map(([k, l]) => (
              <button
                key={k}
                onClick={() => {
                  setFilterSaude(k);
                  setSelectedRow(null);
                }}
                style={{
                  padding: "7px 14px",
                  borderRadius: 7,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                  background: filterSaude === k ? "#6366f1" : "rgba(255,255,255,0.03)",
                  color: filterSaude === k ? "#fff" : "#7f8ea3",
                  transition: "all 0.15s",
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <select
            value={filterLocal}
            onChange={(e) => {
              setFilterLocal(e.target.value);
              setSelectedRow(null);
            }}
            style={{
              padding: "7px 11px",
              borderRadius: 7,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "#d0d8e4",
              fontSize: 11,
              outline: "none",
              cursor: "pointer",
            }}
          >
            {localizacoes.map((l) => (
              <option key={l} value={l}>
                {l === "TODOS" ? "Todas localizações" : l}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: "#5b6b80", marginLeft: "auto" }}>
            {filterSemana !== "TODOS" && (
              <span
                style={{
                  marginRight: 8,
                  background:
                    filterSemana === "RODARAM"
                      ? "rgba(52,211,153,0.12)"
                      : "rgba(248,113,113,0.12)",
                  color: filterSemana === "RODARAM" ? "#34d399" : "#f87171",
                  padding: "2px 8px",
                  borderRadius: 5,
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                {filterSemana === "RODARAM" ? "✓ Esta semana" : "✕ Pendentes"}
              </span>
            )}
            {filtered.length} de {data.length}
          </span>
        </div>

        {/* ---- TABLE ---- */}
        <div
          style={{
            background: "rgba(255,255,255,0.015)",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 14,
            overflow: "hidden",
            animation: "slideUp 0.4s ease 400ms both",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      onClick={c.sort ? () => handleSort(c.key) : undefined}
                      style={{
                        padding: "13px 14px",
                        textAlign: "left",
                        fontSize: 10,
                        fontWeight: 600,
                        color: "#5b6b80",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        whiteSpace: "nowrap",
                        cursor: c.sort ? "pointer" : "default",
                        userSelect: "none",
                      }}
                    >
                      {c.label}
                      {sortCol === c.key && (
                        <span style={{ marginLeft: 4, fontSize: 9 }}>
                          {sortDir === "asc" ? "▲" : "▼"}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => (
                  <tr
                    key={d.asset_tag || i}
                    onClick={() => setSelectedRow(selectedRow === i ? null : i)}
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.025)",
                      cursor: "pointer",
                      background:
                        selectedRow === i
                          ? "rgba(99,102,241,0.05)"
                          : hoveredRow === i
                          ? "rgba(255,255,255,0.015)"
                          : "transparent",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={() => setHoveredRow(i)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <td
                      style={{
                        padding: "11px 14px",
                        fontFamily: "'IBM Plex Mono',monospace",
                        fontWeight: 600,
                        color: "#b4bfff",
                        fontSize: 11,
                      }}
                    >
                      {d.hostname}
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <div
                        style={{
                          fontWeight: 500,
                          color: "#d0d8e4",
                          lineHeight: 1.3,
                          fontSize: 12,
                        }}
                      >
                        {d.colaborador}
                      </div>
                      <div style={{ fontSize: 10, color: "#5b6b80" }}>
                        {d.email}
                      </div>
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <span
                        style={{
                          background: "rgba(129,140,248,0.08)",
                          color: "#a5b4fc",
                          padding: "3px 9px",
                          borderRadius: 5,
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      >
                        {d.localizacao}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px", color: "#7f8ea3", fontSize: 11 }}>
                      {d.categoria}
                    </td>
                    <td style={{ padding: "11px 14px", color: "#7f8ea3", fontSize: 11 }}>
                      {d.fabricante}
                    </td>
                    {/* Período — compliance com a janela atual */}
                    <td style={{ padding: "11px 14px" }}>
                      {(() => {
                        const noPeriodo = dateOnOrAfter(d.execDate, lastScheduled);
                        if (noPeriodo)
                          return (
                            <span style={periodoBadge("#34d399")}>✓ No período</span>
                          );
                        if (d.status_limpeza === "NUNCA")
                          return (
                            <span style={periodoBadge("#f87171")}>✕ Nunca executado</span>
                          );
                        if (d.status_limpeza === "PENDENTE")
                          return (
                            <span style={periodoBadge("#a78bfa")}>○ Pendente</span>
                          );
                        return (
                          <div>
                            <span style={periodoBadge("#fbbf24")}>⚠ Fora do período</span>
                            <div style={{ fontSize: 9, color: "#5b6b80", marginTop: 3 }}>
                              última: {formatExecDateShort(d.ultima_execucao)}
                            </div>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Resultado — qualidade da última execução */}
                    <td style={{ padding: "11px 14px" }}>
                      {!d.status_geral ? (
                        <span style={{ color: "#3d4a5c", fontSize: 11 }}>—</span>
                      ) : d.status_geral === "OK" ? (
                        <span style={periodoBadge("#34d399")}>✓ OK</span>
                      ) : d.status_geral === "AVISO" ? (
                        <div>
                          <span style={periodoBadge("#fbbf24")}>⚠ Aviso</span>
                          {d.aviso_count > 0 && (
                            <div style={{ fontSize: 9, color: "#fbbf24", marginTop: 3 }}>
                              {d.aviso_count} aviso(s)
                            </div>
                          )}
                        </div>
                      ) : d.status_geral === "ERRO" ? (
                        <div>
                          <span style={periodoBadge("#f87171")}>✕ Erro</span>
                          {d.erro_count > 0 && (
                            <div style={{ fontSize: 9, color: "#f87171", marginTop: 3 }}>
                              {d.erro_count} erro(s)
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "#7f8ea3", fontSize: 11 }}>{d.status_geral}</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "11px 14px",
                        color: d.ultima_execucao ? "#7f8ea3" : "#3d4a5c",
                        fontSize: 11,
                        fontFamily: "'IBM Plex Mono',monospace",
                      }}
                    >
                      {d.ultima_execucao || "—"}
                    </td>
                    <td style={{ padding: "11px 14px", textAlign: "center" }}>
                      {d.dias_desde_limpeza != null ? (
                        <span
                          style={{
                            fontFamily: "'IBM Plex Mono',monospace",
                            fontWeight: 700,
                            fontSize: 12,
                            color:
                              d.dias_desde_limpeza <= 7
                                ? "#34d399"
                                : d.dias_desde_limpeza <= 14
                                ? "#fbbf24"
                                : "#f87171",
                          }}
                        >
                          {d.dias_desde_limpeza}d
                        </span>
                      ) : (
                        <span style={{ color: "#3d4a5c" }}>{"—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div
              style={{
                padding: 44,
                textAlign: "center",
                color: "#5b6b80",
                fontSize: 13,
              }}
            >
              Nenhum registro encontrado.
            </div>
          )}
        </div>

        {/* ---- DETAIL PANEL ---- */}
        {selectedRow !== null &&
          filtered[selectedRow] &&
          (() => {
            const d = filtered[selectedRow];
            return (
              <div
                style={{
                  marginTop: 14,
                  background: "rgba(99,102,241,0.03)",
                  border: "1px solid rgba(99,102,241,0.12)",
                  borderRadius: 14,
                  padding: 22,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 18,
                  animation: "fadeIn 0.2s ease",
                }}
              >
                <div>
                  <div style={detailLabelStyle}>Máquina</div>
                  <div style={{ color: "#d0d8e4", fontWeight: 600, marginBottom: 3 }}>
                    {d.hostname}
                  </div>
                  <div style={detailSubStyle}>{d.modelo}</div>
                  <div style={detailSubStyle}>Serial: {d.serial}</div>
                  <div style={detailSubStyle}>Asset: {d.asset_tag}</div>
                </div>
                <div>
                  <div style={detailLabelStyle}>Colaborador</div>
                  <div style={{ color: "#d0d8e4", fontWeight: 600, marginBottom: 3 }}>
                    {d.colaborador}
                  </div>
                  <div style={detailSubStyle}>{d.email}</div>
                  <div style={detailSubStyle}>Local: {d.localizacao}</div>
                </div>
                <div>
                  <div style={detailLabelStyle}>Execução</div>
                  {d.status_limpeza === "NUNCA" ? (
                    <div style={{ color: "#f87171", fontWeight: 600, fontSize: 13 }}>
                      Nunca executado
                    </div>
                  ) : (
                    <>
                      <div style={{ color: "#d0d8e4", fontWeight: 600, marginBottom: 3 }}>
                        {d.ultima_execucao}
                      </div>
                      <div style={detailSubStyle}>{d.status_msg}</div>
                      <div style={{ marginTop: 7 }}>
                        <div style={{ fontSize: 12, color: "#d0d8e4", marginBottom: 6 }}>
                          <span style={{ fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace" }}>
                            {d.ok_count}
                          </span>
                          {d.total_etapas != null && (
                            <span style={{ color: "#5b6b80" }}>/{d.total_etapas}</span>
                          )}
                          <span style={{ color: "#5b6b80", fontSize: 11 }}> etapas concluídas</span>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {(d.aviso_count > 0 || d.erro_count > 0) ? (
                            <>
                              {d.aviso_count > 0 && (
                                <span style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24", padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600 }}>
                                  ⚠ {d.aviso_count} aviso{d.aviso_count !== 1 ? "s" : ""}
                                </span>
                              )}
                              {d.erro_count > 0 && (
                                <span style={{ background: "rgba(248,113,113,0.1)", color: "#f87171", padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600 }}>
                                  ✕ {d.erro_count} erro{d.erro_count !== 1 ? "s" : ""}
                                </span>
                              )}
                            </>
                          ) : (
                            <span style={{ background: "rgba(52,211,153,0.08)", color: "#34d399", padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600 }}>
                              ✓ sem ocorrências
                            </span>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

        {/* ---- FOOTER ---- */}
        <div
          style={{
            marginTop: 20,
            padding: "14px 0",
            borderTop: "1px solid rgba(255,255,255,0.03)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 10, color: "#3d4a5c" }}>
            Script: limpeza_2_0.bat &middot; Refresh: {REFRESH_INTERVAL / 1000}s
          </span>
          <span style={{ fontSize: 10, color: "#3d4a5c" }}>
            Fonte: {source === "api" ? "API (online)" : "dados locais (offline)"}
          </span>
        </div>
      </div>

    </div>
  );
}

function periodoBadge(color) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: color + "18",
    color,
    padding: "3px 9px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}

const detailLabelStyle = {
  fontSize: 10,
  color: "#5b6b80",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 6,
  fontWeight: 600,
};

const detailSubStyle = {
  fontSize: 11,
  color: "#7f8ea3",
};
