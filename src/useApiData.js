import { useState, useEffect, useCallback, useRef } from "react";
import { REFRESH_INTERVAL } from "./config.js";
import { FALLBACK_DATA } from "./fallbackData.js";

// Parsing de data feito UMA VEZ por item, dentro de normalize().
// Suporta DD/MM/YYYY e YYYY-MM-DD (com ou sem horário).
function parseExecDate(str) {
  if (!str) return null;
  let m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], 0, 0, 0, 0);
  m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);
  return null;
}

function normalizeSaude(s) {
  if (!s) return "CRITICO";
  const u = s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (u.includes("EM_DIA") || u.includes("EM DIA")) return "EM_DIA";
  if (u.includes("CRITICO")) return "CRITICO";
  if (u.includes("ATRASADO")) return "ATRASADO";
  return "CRITICO";
}

// Mapeia campos do banco para nomes padrão do frontend.
// execDate é pré-calculado aqui para evitar parsing repetido em useMemo/renders.
export function normalize(row) {
  const ultimaExecucao = row.ultima_execucao_em ?? row.ultima_execucao ?? null;
  return {
    asset_tag:           row.asset_tag ?? "",
    hostname:            row.hostname_esperado ?? row.hostname ?? "",
    serial:              row.serial ?? "",
    modelo:              row.modelo ?? "",
    fabricante:          row.fabricante ?? "",
    categoria:           row.categoria ?? "",
    colaborador:         row.colaborador ?? "",
    email:               row.colaborador_email ?? row.email ?? "",
    localizacao:         row.localizacao ?? "",
    status_snipe:        row.status_snipe ?? "",
    status_limpeza:      row.status_limpeza ?? "NUNCA",
    status_limpeza_label: row.status_limpeza_label ?? "",
    ultima_execucao:     ultimaExecucao,
    execDate:            parseExecDate(ultimaExecucao), // Date pré-parseado, reutilizado sem regex extra
    status_geral:        row.ultimo_status_geral ?? row.status_geral ?? null,
    status_msg:          row.ultimo_status_msg ?? row.status_msg ?? null,
    total_etapas:        row.total_etapas ?? null,
    ok_count:            row.ok_count ?? null,
    aviso_count:         row.aviso_count ?? null,
    erro_count:          row.erro_count ?? null,
    usuario_execucao:    row.usuario_execucao ?? null,
    dias_desde_limpeza:  row.dias_desde_ultima_limpeza ?? row.dias_desde_limpeza ?? null,
    saude:               normalizeSaude(row.saude_limpeza ?? row.saude),
  };
}

// Hook que busca dados via proxy autenticado com auto-refresh e fallback.
// token         — JWT da sessão atual
// onUnauthorized — callback chamado quando o servidor retorna 401
export function useApiData(token, onUnauthorized) {
  const [data, setData]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [source, setSource]       = useState("fallback");
  const controllerRef             = useRef(null);

  const fetchData = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    // Cancela fetch anterior se ainda estiver em voo
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();

    try {
      const res = await fetch("/api/painel", {
        signal: controllerRef.current.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401) {
        onUnauthorized?.();
        return;
      }

      if (!res.ok) throw new Error("HTTP " + res.status);

      let json = await res.json();

      // N8N pode retornar [{json: {...}}, ...] ou [{...}, ...]
      if (Array.isArray(json) && json.length > 0 && json[0].json) {
        json = json.map((i) => i.json);
      }

      const cleaned = json.filter(
        (r) => r.asset_tag || r.hostname_esperado || r.hostname
      );

      if (cleaned.length > 0) {
        setData(cleaned);
        setSource("api");
        setError(null);
      } else {
        throw new Error("Dados vazios");
      }
    } catch (err) {
      if (err.name === "AbortError") return; // fetch cancelado intencionalmente — ignorar
      setData(FALLBACK_DATA);
      setSource("fallback");
      setError("API indisponível");
    } finally {
      setLoading(false);
      setLastUpdate(new Date());
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, REFRESH_INTERVAL);
    return () => {
      clearInterval(iv);
      controllerRef.current?.abort(); // cancela fetch pendente ao desmontar
    };
  }, [fetchData]);

  return { data, loading, error, lastUpdate, source, refresh: fetchData };
}
