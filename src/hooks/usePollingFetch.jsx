import { useState, useEffect, useCallback, useRef } from "react";

// Referência estável para o estado "ainda não carregou" — um `?? []` inline
// devolveria um array novo a cada render e invalidaria os useMemo do consumidor.
const VAZIO = [];

export function usePollingFetch(fetchFn, intervalMs = 120000, deps = []) {
  // null = nenhuma resposta chegou ainda; é disso que `loading` é derivado,
  // então não existe estado de loading pra dessincronizar.
  const [data, setData] = useState(null);
  const [updating, setUpdating] = useState(false);

  const fetchFnRef = useRef(fetchFn);
  const intervalRef = useRef(null);
  const abortRef = useRef(null);
  const inFlightRef = useRef(false);
  // Só a requisição mais recente pode aplicar seu resultado. Usar o sinal de
  // abort pra isso quebra no remonte do StrictMode: o cleanup cancela a própria
  // busca do mount e a resposta é descartada.
  const seqRef = useRef(0);

  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  const fetchData = useCallback(async (isBackground = false) => {
    // Polls de fundo não se sobrepõem; fetches explícitos (mount/filtros)
    // sempre disparam, abortando o anterior — senão a lista fica presa em
    // "Carregando..." quando um fetch em voo é abortado pelo cleanup do effect.
    if (inFlightRef.current && isBackground) return;
    inFlightRef.current = true;

    const seq = ++seqRef.current;

    // Cancela a requisição anterior ao trocar de filtro — supersessão legítima,
    // e o guarda de sequência já garante a correção mesmo sem ela.
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await fetchFnRef.current(controller.signal);
      if (seq === seqRef.current) setData(result);
    } catch (error) {
      if (error?.name !== "AbortError") console.error("Erro ao buscar dados:", error);
    } finally {
      // só a requisição vigente libera o flag — assim uma resposta obsoleta não
      // derruba o estado de uma busca mais nova que já esteja em voo
      if (seq === seqRef.current) {
        inFlightRef.current = false;
        setUpdating(false);
      }
    }
  }, []);

  // Poll de fundo: sinaliza "atualizando" e busca. O setUpdating vive aqui, e
  // não dentro do fetchData, pra que o fetch do mount não tenha nenhum setState
  // síncrono — é o que dispararia renders em cascata a partir do efeito.
  const fetchBackground = useCallback(() => {
    if (inFlightRef.current) return;
    setUpdating(true);
    fetchData(true);
  }, [fetchData]);

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchBackground, intervalMs);
  }, [intervalMs, fetchBackground]);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    fetchData(false);
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      startInterval();
    }
    // Não abortar aqui: no remonte do StrictMode este cleanup rodaria contra a
    // busca que o próprio efeito acabou de disparar.
    return stopInterval;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, fetchData, ...deps]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchBackground();
        startInterval();
      } else {
        // Parar o polling basta; abortar aqui só arriscaria descartar uma
        // resposta boa que já estava a caminho.
        stopInterval();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchBackground, startInterval, stopInterval]);

  return { data: data ?? VAZIO, loading: data === null, updating, refresh: fetchBackground };
}
