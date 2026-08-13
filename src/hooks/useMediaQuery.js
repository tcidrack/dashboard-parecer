import { useCallback, useSyncExternalStore } from "react";

// Props do Recharts (largura do eixo, raio da rosca, rótulos) não são alcançáveis
// por CSS — precisam do breakpoint em JS. useSyncExternalStore em vez de
// useState + useEffect porque já entrega o valor certo no primeiro render: com
// efeito haveria um frame com o layout de desktop antes da correção.
export function useMediaQuery(query) {
  const subscribe = useCallback((onChange) => {
    if (typeof window === "undefined" || !window.matchMedia) return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  // Sem DOM não há viewport estreito a assumir; desktop é o padrão seguro.
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
