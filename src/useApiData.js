import { useState, useEffect, useCallback } from "react";
import { REFRESH_INTERVAL } from "./config.js";
import { FALLBACK_DATA } from "./fallbackData.js";

// Normaliza acentos para comparação segura
function normalizeSaude(s) {
  if (!s) return "CRITICO";
  const u = s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (u.includes("EM_DIA") || u.includes("EM DIA")) return "EM_DIA";
  if (u.includes("CRITICO")) return "CRITICO";
  if (u.includes("ATRASADO")) return "ATRASADO";
  return "CRITICO";
}

// Mapeia campos do banco para nomes padrão do frontend
export function normalize(row) {
  return {
    asset_tag: row.asset_tag ?? "",
    hostname: row.hostname_esperado ?? row.hostname ?? "",
    serial: row.serial ?? "",
    modelo: row.modelo ?? "",
    fabricante: row.fabricante ?? "",
    categoria: row.categoria ?? "",
    colaborador: row.colaborador ?? "",
    email: row.colaborador_email ?? row.email ?? "",
    localizacao: row.localizacao ?? "",
    status_snipe: row.status_snipe ?? "",
    status_limpeza: row.status_limpeza ?? "NUNCA",
    status_limpeza_label: row.status_limpeza_label ?? "",
    ultima_execucao: row.ultima_execucao_em ?? row.ultima_execucao ?? null,
    status_geral: row.ultimo_status_geral ?? row.status_geral ?? null,
    status_msg: row.ultimo_status_msg ?? row.status_msg ?? null,
    total_etapas: row.total_etapas ?? null,
    ok_count: row.ok_count ?? null,
    aviso_count: row.aviso_count ?? null,
    erro_count: row.erro_count ?? null,
    usuario_execucao: row.usuario_execucao ?? null,
    dias_desde_limpeza: row.dias_desde_ultima_limpeza ?? row.dias_desde_limpeza ?? null,
    saude: normalizeSaude(row.saude_limpeza ?? row.saude),
  };
}

// Hook que busca dados via proxy autenticado com auto-refresh e fallback
// token        — JWT da sessão atual
// onUnauthorized — callback chamado quando o servidor retorna 401
export function useApiData(token, onUnauthorized) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [source, setSource] = useState("fallback");

  const fetchData = useCallback(async () => {
    if (!token) {
      // Token ausente: encerrar estado de loading para não manter spinner infinito
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/painel", {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      // Sessão expirada ou inválida — forçar logout
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
      setData(FALLBACK_DATA);
      setSource("fallback");
      // Mensagem genérica para o usuário; detalhes ficam no console do servidor
      setError("API indisponível");
    } finally {
      setLoading(false);
      setLastUpdate(new Date());
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(iv);
  }, [fetchData]);

  return { data, loading, error, lastUpdate, source, refresh: fetchData };
}
