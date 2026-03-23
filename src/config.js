// ============================================================================
// CONFIGURAÇÃO CENTRAL — leia os valores das variáveis de ambiente
// Nunca coloque URLs ou segredos diretamente aqui.
// ============================================================================

// Intervalo de auto-refresh em milissegundos (padrão: 1 hora)
// Controlado por VITE_REFRESH_INTERVAL no .env
export const REFRESH_INTERVAL =
  Number(import.meta.env.VITE_REFRESH_INTERVAL) || 3_600_000;
