const BR_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dataHojeBR() {
  return BR_DATE_FMT.format(new Date());
}

// Formata uma duração em minutos como "Xh Ymin" / "Y min" (null se < 1 min)
export function formatarDuracao(totalMin) {
  if (totalMin == null || totalMin < 1) return null;
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
