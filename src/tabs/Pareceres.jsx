import { useState, useCallback, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
  ComposedChart, Line, PieChart, Pie, Cell,
} from "recharts";
import { supabase } from "../lib/supabase";
import { dataHojeBR } from "../lib/dateUtils";
import {
  num, formatarMoedaBR, formatarMoedaCompactaBR, formatarPercentualBR,
} from "../lib/formatUtils";
import { usePollingFetch } from "../hooks/usePollingFetch";

// Teto de linhas por consulta. Indicadores, gráficos e tabela saem todos desse
// mesmo conjunto, então é ele que define o alcance do painel.
const LIMITE_LINHAS = 5000;

const fmtInteiro = (v) => (v == null ? "—" : Number(v).toLocaleString("pt-BR"));
const fmtDias = (v) => {
  if (v == null) return "—";
  const n = Math.round(Number(v));
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? "dia" : "dias"}`;
};

const METRICAS = {
  quantidade:     { label: "Quantidade de faturas",    fmt: fmtInteiro,          fmtEixo: fmtInteiro },
  valor_cobrado:  { label: "Valor cobrado",            fmt: formatarMoedaBR,     fmtEixo: formatarMoedaCompactaBR },
  valor_liberado: { label: "Valor liberado",           fmt: formatarMoedaBR,     fmtEixo: formatarMoedaCompactaBR },
  valor_glosa:    { label: "Glosa",                    fmt: formatarMoedaBR,     fmtEixo: formatarMoedaCompactaBR },
  pct_glosa:      { label: "% glosa",                  fmt: formatarPercentualBR, fmtEixo: (v) => formatarPercentualBR(v, 0) },
  permanencia:    { label: "Permanência média",        fmt: fmtDias,             fmtEixo: fmtInteiro },
  custo_dia:      { label: "Custo médio por dia",      fmt: formatarMoedaBR,     fmtEixo: formatarMoedaCompactaBR },
};

// Coluna DATE ("YYYY-MM-DD") — sem new Date() para não deslocar o dia por timezone
function formatarDataBR(iso) {
  if (!iso) return "—";
  return iso.split("-").reverse().join("/");
}

function formatarDataHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return (
    `${String(d.getDate()).padStart(2, "0")}/` +
    `${String(d.getMonth() + 1).padStart(2, "0")}/` +
    `${d.getFullYear()} ` +
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  );
}

// Dashboard de apresentação: abre no mês corrente (não só "hoje") para já mostrar dados.
// Deriva de dataHojeBR() ("YYYY-MM-DD") para manter o fuso de São Paulo.
function primeiroDiaDoMesBR() {
  return dataHojeBR().slice(0, 8) + "01";
}

// Cabeçalho explicativo de seção — texto de apresentação, sem lógica.
function SecaoTitulo({ titulo, descricao, cor }) {
  return (
    <div className="secao" style={{ color: cor }}>
      <h2>{titulo}</h2>
      {descricao && <p>{descricao}</p>}
    </div>
  );
}

// Acumula somas/contagens ignorando nulls (nunca tratados como 0 nas médias)
function novoAcumulador() {
  return {
    n: 0,
    somaCobrado: 0,
    somaLiberado: 0, nLiberado: 0,
    somaGlosa: 0, somaCobradoPareado: 0,
    somaDias: 0, nDias: 0,
    somaLiberadoComDias: 0,
  };
}

function acumular(acc, r) {
  acc.n += 1;
  const cobrado = num(r.valor_cobrado);
  const liberado = num(r.valor_liberado);
  const glosa = num(r.valor_glosa);
  const dias = num(r.dias_internacao);
  if (cobrado != null) acc.somaCobrado += cobrado;
  if (liberado != null) { acc.somaLiberado += liberado; acc.nLiberado += 1; }
  if (glosa != null && cobrado != null) { acc.somaGlosa += glosa; acc.somaCobradoPareado += cobrado; }
  if (dias != null && dias > 0) {
    acc.somaDias += dias;
    acc.nDias += 1;
    if (liberado != null) acc.somaLiberadoComDias += liberado;
  }
}

function valorMetrica(acc, metrica) {
  switch (metrica) {
    case "quantidade":     return acc.n;
    case "valor_cobrado":  return acc.somaCobrado || null;
    case "valor_liberado": return acc.somaLiberado || null;
    case "valor_glosa":    return acc.somaGlosa || null;
    case "pct_glosa":      return acc.somaCobradoPareado > 0 ? (acc.somaGlosa / acc.somaCobradoPareado) * 100 : null;
    case "permanencia":    return acc.nDias > 0 ? acc.somaDias / acc.nDias : null;
    case "custo_dia":      return acc.somaDias > 0 ? acc.somaLiberadoComDias / acc.somaDias : null;
    default:               return null;
  }
}

function agruparPor(dados, chave, metrica) {
  const grupos = new Map();
  for (const r of dados) {
    const nome = r[chave] || "Não informado";
    let acc = grupos.get(nome);
    if (!acc) { acc = novoAcumulador(); grupos.set(nome, acc); }
    acumular(acc, r);
  }
  return [...grupos.entries()]
    .map(([nome, acc]) => ({ nome, valor: valorMetrica(acc, metrica) }))
    .filter((g) => g.valor != null)
    .sort((a, b) => b.valor - a.valor);
}

function truncar(s, max) {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export default function Pareceres({ tema, cores }) {
  const [busca, setBusca] = useState("");
  const [dataInicio, setDataInicio] = useState(primeiroDiaDoMesBR);
  const [dataFim, setDataFim] = useState("");
  const [filtroPrestador, setFiltroPrestador] = useState("");
  const [filtroMacro, setFiltroMacro] = useState("");
  const [filtroTipoCompra, setFiltroTipoCompra] = useState("");
  const [metrica, setMetrica] = useState("valor_glosa");
  const [prestadores, setPrestadores] = useState([]);
  const [macros, setMacros] = useState([]);
  const [tiposCompra, setTiposCompra] = useState([]);
  const ITENS_POR_PAGINA = 20;
  const [pagina, setPagina] = useState(1);

  const accentColor = tema === "escuro" ? "#FFCB05" : "#FF0073";
  const corSecundaria = tema === "escuro" ? "#60A5FA" : "#0070FF";
  const corTerceira = tema === "escuro" ? "#C4B5FD" : "#7C3AED";
  // Paleta categórica validada por tema (validate_palette.js do skill dataviz)
  const PALETA = tema === "escuro"
    ? ["#60A5FA", "#FFCB05", "#C4B5FD", "#34D399", "#FB923C"]
    : ["#0070FF", "#FF0073", "#7C3AED", "#00876C", "#B45309"];

  const fetchPareceres = useCallback(async (signal) => {
    let q = supabase
      .from("pareceres")
      .select("id, created_at, numero_oficio, data_parecer, numero_conta, prestador, macrorregiao, tipo_compra, cid, dias_internacao, valor_cobrado, valor_liberado, valor_glosa, percentual_glosa, custo_por_dia")
      .order("created_at", { ascending: false });
    if (dataInicio) {
      q = q.gte("created_at", dataInicio);
    }
    if (dataFim) q = q.lte("created_at", dataFim + "T23:59:59");
    if (filtroPrestador) q = q.eq("prestador", filtroPrestador);
    if (filtroMacro) q = q.eq("macrorregiao", filtroMacro);
    if (filtroTipoCompra) q = q.eq("tipo_compra", filtroTipoCompra);
    q = q.limit(LIMITE_LINHAS);
    if (signal) q = q.abortSignal(signal);
    const { data, error } = await q;
    if (error) {
      // Abort é supersessão normal (troca de filtro), não falha — logar só o
      // que de fato deu errado mantém o console significativo.
      if (!signal?.aborted) console.error("[pareceres] Falha ao buscar as linhas:", error);
      return [];
    }
    return data || [];
  }, [dataInicio, dataFim, filtroPrestador, filtroMacro, filtroTipoCompra]);

  const { data: dados, loading } = usePollingFetch(
    fetchPareceres,
    120000,
    [dataInicio, dataFim, filtroPrestador, filtroMacro, filtroTipoCompra]
  );

  // KPIs derivados das mesmas linhas que alimentam tabela e gráficos — uma só
  // fonte de verdade, então os cards nunca discordam do que está listado abaixo.
  const kpis = useMemo(() => {
    const acc = novoAcumulador();
    for (const r of dados) acumular(acc, r);
    return {
      faturas: acc.n,
      valorCobrado: acc.somaCobrado,
      valorLiberado: acc.somaLiberado,
      glosa: acc.somaGlosa,
      pctGlosa: valorMetrica(acc, "pct_glosa"),
      permanenciaMedia: valorMetrica(acc, "permanencia"),
      custoPorDia: valorMetrica(acc, "custo_dia"),
      custoPorInternacao: acc.nLiberado > 0 ? acc.somaLiberado / acc.nLiberado : null,
    };
  }, [dados]);

  // Valores únicos para os dropdowns (carga única na montagem)
  useEffect(() => {
    let ativo = true;
    (async () => {
      const [presRes, macroRes, tipoRes] = await Promise.all([
        supabase.from("pareceres").select("prestador").not("prestador", "is", null).limit(LIMITE_LINHAS),
        supabase.from("pareceres").select("macrorregiao").not("macrorregiao", "is", null).limit(LIMITE_LINHAS),
        supabase.from("pareceres").select("tipo_compra").not("tipo_compra", "is", null).limit(LIMITE_LINHAS),
      ]);
      if (!ativo) return;
      if (presRes.error) console.error("[pareceres] Falha ao carregar prestadores:", presRes.error);
      if (macroRes.error) console.error("[pareceres] Falha ao carregar macrorregiões:", macroRes.error);
      if (tipoRes.error) console.error("[pareceres] Falha ao carregar tipos de compra:", tipoRes.error);
      setPrestadores([...new Set((presRes.data || []).map((r) => r.prestador))].sort());
      setMacros([...new Set((macroRes.data || []).map((r) => r.macrorregiao))].sort());
      setTiposCompra([...new Set((tipoRes.data || []).map((r) => r.tipo_compra))].sort());
    })();
    return () => { ativo = false; };
  }, []);

  let filtrados = dados;
  if (busca.trim()) {
    const termo = busca.trim().toLowerCase();
    filtrados = filtrados.filter((r) =>
      (r.numero_oficio || "").toLowerCase().includes(termo) ||
      (r.numero_conta || "").toLowerCase().includes(termo) ||
      (r.prestador || "").toLowerCase().includes(termo)
    );
  }

  // Cobrado vs Liberado por mês de data_parecer
  const chartMensal = useMemo(() => {
    const meses = new Map();
    for (const r of dados) {
      const mes = r.data_parecer?.slice(0, 7);
      if (!mes) continue;
      let m = meses.get(mes);
      if (!m) { m = { cobrado: 0, liberado: 0, glosa: 0 }; meses.set(mes, m); }
      const cobrado = num(r.valor_cobrado);
      const liberado = num(r.valor_liberado);
      const glosa = num(r.valor_glosa);
      if (cobrado != null) m.cobrado += cobrado;
      if (liberado != null) m.liberado += liberado;
      if (glosa != null) m.glosa += glosa;
    }
    return [...meses.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, v]) => ({ mes: `${mes.slice(5)}/${mes.slice(0, 4)}`, ...v }));
  }, [dados]);

  // Rosca: participação de cada tipo de compra na glosa (métrica fixa e aditiva)
  const composicaoTipoCompra = useMemo(() => {
    const grupos = new Map();
    for (const r of dados) {
      const glosa = num(r.valor_glosa);
      if (glosa == null) continue;
      const nome = r.tipo_compra || "Não informado";
      grupos.set(nome, (grupos.get(nome) || 0) + glosa);
    }
    const total = [...grupos.values()].reduce((a, b) => a + b, 0);
    if (total <= 0) return [];
    let itens = [...grupos.entries()].map(([nome, valor]) => ({ nome, valor }));
    // mais grupos que cores na paleta: agrega os menores em "Outros" (nunca ciclar cor)
    if (itens.length > PALETA.length) {
      itens.sort((a, b) => b.valor - a.valor);
      const maiores = itens.slice(0, PALETA.length - 1);
      const outros = itens.slice(PALETA.length - 1).reduce((acc, i) => acc + i.valor, 0);
      itens = [...maiores, { nome: "Outros", valor: outros }];
    }
    // ordem alfabética estável: a cor segue a entidade entre filtros
    return itens
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map((i) => ({ ...i, pct: (i.valor / total) * 100 }));
  }, [dados, PALETA.length]);

  // Colunas agrupadas: cobrado vs liberado por macrorregião
  const macroCobradoLiberado = useMemo(() => {
    const grupos = new Map();
    for (const r of dados) {
      const nome = r.macrorregiao || "Não informado";
      let m = grupos.get(nome);
      if (!m) { m = { nome, cobrado: 0, liberado: 0 }; grupos.set(nome, m); }
      const cobrado = num(r.valor_cobrado);
      const liberado = num(r.valor_liberado);
      if (cobrado != null) m.cobrado += cobrado;
      if (liberado != null) m.liberado += liberado;
    }
    return [...grupos.values()].sort((a, b) => b.cobrado - a.cobrado);
  }, [dados]);

  const graficosRanking = useMemo(() => [
    { titulo: "por CID (Top 10)", dados: agruparPor(dados, "cid", metrica).slice(0, 10), altura: 300, yWidth: 240, maxNome: 35 },
    { titulo: "por Prestador (Top 10)", dados: agruparPor(dados, "prestador", metrica).slice(0, 10), altura: 300, yWidth: 240, maxNome: 35 },
  ], [dados, metrica]);

  const totalPaginas = Math.ceil(filtrados.length / ITENS_POR_PAGINA);
  const paginaSegura = Math.min(Math.max(1, pagina), Math.max(1, totalPaginas));
  const inicio = (paginaSegura - 1) * ITENS_POR_PAGINA;
  const paginaDados = filtrados.slice(inicio, inicio + ITENS_POR_PAGINA);

  const PAGINAS_VISIVEIS = 5;
  const metade = Math.floor(PAGINAS_VISIVEIS / 2);
  let inicioPaginas = Math.max(1, paginaSegura - metade);
  let fimPaginas = Math.min(totalPaginas, inicioPaginas + PAGINAS_VISIVEIS - 1);
  if (fimPaginas - inicioPaginas + 1 < PAGINAS_VISIVEIS) {
    inicioPaginas = Math.max(1, fimPaginas - PAGINAS_VISIVEIS + 1);
  }
  const paginasVisiveis = Array.from(
    { length: fimPaginas - inicioPaginas + 1 },
    (_, i) => inicioPaginas + i
  );

  function irParaPagina(p) {
    setPagina(Math.min(Math.max(1, p), totalPaginas));
  }

  // Voltar pra primeira página quando o recorte muda. Ajustar durante o render
  // (padrão "You Might Not Need an Effect") em vez de num efeito: o React
  // reexecuta o componente na hora, sem render intermediário no DOM.
  const chaveFiltros = [busca, dataInicio, dataFim, filtroPrestador, filtroMacro, filtroTipoCompra].join("\u0000");
  const [chaveAnterior, setChaveAnterior] = useState(chaveFiltros);
  if (chaveAnterior !== chaveFiltros) {
    setChaveAnterior(chaveFiltros);
    setPagina(1);
  }

  function limparFiltros() {
    setBusca("");
    setDataInicio("");
    setDataFim("");
    setFiltroPrestador("");
    setFiltroMacro("");
    setFiltroTipoCompra("");
  }

  function exportarExcel() {
    const ws = XLSX.utils.aoa_to_sheet([
      ["", "", "", "Faturas auditadas", kpis.faturas],
      ["", "", "", "Permanência média (dias)", kpis.permanenciaMedia != null ? Number(kpis.permanenciaMedia.toFixed(1)) : "—"],
      ["", "", "", "Custo médio por dia", kpis.custoPorDia != null ? Number(kpis.custoPorDia.toFixed(2)) : "—"],
      ["", "", "", "Custo médio por internação", kpis.custoPorInternacao != null ? Number(kpis.custoPorInternacao.toFixed(2)) : "—"],
      ["", "", "", "Valor cobrado", Number(kpis.valorCobrado.toFixed(2))],
      ["", "", "", "Valor liberado", Number(kpis.valorLiberado.toFixed(2))],
      ["", "", "", "Glosa", Number(kpis.glosa.toFixed(2))],
      ["", "", "", "% glosado", kpis.pctGlosa != null ? Number(kpis.pctGlosa.toFixed(2)) : "—"],
      [],
      ["Nº Ofício", "Data Parecer", "Processado em", "Nº Conta", "Prestador", "Macrorregião", "Tipo Compra", "CID", "Dias Intern.", "V. Cobrado", "V. Liberado", "Glosa", "% Glosa"],
      ...filtrados.map((r) => [
        r.numero_oficio || "—",
        formatarDataBR(r.data_parecer),
        formatarDataHora(r.created_at),
        r.numero_conta || "—",
        r.prestador || "—",
        r.macrorregiao || "—",
        r.tipo_compra || "—",
        r.cid || "—",
        num(r.dias_internacao) ?? "—",
        num(r.valor_cobrado) ?? "—",
        num(r.valor_liberado) ?? "—",
        num(r.valor_glosa) ?? "—",
        num(r.percentual_glosa) ?? "—",
      ]),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pareceres");
    XLSX.writeFile(wb, "pareceres.xlsx");
  }

  const cardStyle = { backgroundColor: cores.card, color: cores.texto, cursor: "pointer" };

  // Rótulo direto da rosca em token de texto do tema (nunca na cor da fatia)
  function renderRotuloRosca({ cx, cy, midAngle, outerRadius, percent, name }) {
    const RAD = Math.PI / 180;
    const r = outerRadius + 16;
    const x = cx + r * Math.cos(-midAngle * RAD);
    const y = cy + r * Math.sin(-midAngle * RAD);
    return (
      <text x={x} y={y} fill={cores.texto} fontSize={11} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central">
        {`${name} (${(percent * 100).toFixed(1).replace(".", ",")}%)`}
      </text>
    );
  }

  return (
    <>
      {/* INDICADORES */}
      <SecaoTitulo
        titulo="Indicadores do período"
        descricao="Resumo consolidado das contas auditadas. Ao limpar os filtros, os cards mostram o total geral (toda a base); com filtros aplicados, refletem o recorte selecionado."
        cor="#fff"
      />

      {/* CARDS */}
      <div className="cards">
        <div className="card animated-card" style={cardStyle}>
          <h3>Faturas Auditadas</h3>
          <p>{kpis.faturas.toLocaleString("pt-BR")}</p>
          <p style={{ fontSize: 13, fontWeight: 400 }}>no período filtrado</p>
        </div>
        <div className="card animated-card" style={cardStyle}>
          <h3>Permanência Média</h3>
          <p>{fmtDias(kpis.permanenciaMedia)}</p>
          <p style={{ fontSize: 13, fontWeight: 400 }}>ignora internações sem datas</p>
        </div>
        <div className="card animated-card" style={cardStyle}>
          <h3>Custo Médio por Dia</h3>
          <p>{formatarMoedaBR(kpis.custoPorDia)}</p>
          <p style={{ fontSize: 13, fontWeight: 400 }}>Σ liberado ÷ Σ dias de internação</p>
        </div>
        <div className="card animated-card" style={cardStyle}>
          <h3>Custo Médio por Internação</h3>
          <p>{formatarMoedaBR(kpis.custoPorInternacao)}</p>
          <p style={{ fontSize: 13, fontWeight: 400 }}>valor liberado médio por fatura</p>
        </div>
        <div className="card animated-card" style={cardStyle}>
          <h3>Valor Cobrado</h3>
          <p>{formatarMoedaBR(kpis.valorCobrado)}</p>
          <p style={{ fontSize: 13, fontWeight: 400 }}>contas apresentadas pré-auditagem</p>
        </div>
        <div className="card animated-card" style={cardStyle}>
          <h3>Valor Liberado</h3>
          <p>{formatarMoedaBR(kpis.valorLiberado)}</p>
          <p style={{ fontSize: 13, fontWeight: 400 }}>liberado após auditagem</p>
        </div>
        <div className="card animated-card" style={cardStyle}>
          <h3>Glosa</h3>
          <p>{formatarMoedaBR(kpis.glosa)}</p>
          <p style={{ fontSize: 13, fontWeight: 400 }}>glosas efetivadas</p>
        </div>
        <div className="card animated-card" style={cardStyle}>
          <h3>% Glosado</h3>
          <p>{formatarPercentualBR(kpis.pctGlosa)}</p>
          <p style={{ fontSize: 13, fontWeight: 400 }}>Σ glosa ÷ Σ cobrado</p>
        </div>
      </div>

      {dados.length >= LIMITE_LINHAS && (
        <p style={{ color: cores.texto, fontSize: 13, opacity: 0.8, margin: "0 0 12px" }}>
          O filtro atingiu o teto de {LIMITE_LINHAS.toLocaleString("pt-BR")} pareceres: indicadores,
          gráficos e tabela refletem apenas os mais recentes. Refine o período para um recorte exato.
        </p>
      )}

      {/* EVOLUÇÃO E COMPOSIÇÃO */}
      {(chartMensal.length > 0 || dados.length > 0) && (
        <SecaoTitulo
          titulo="Evolução e composição"
          descricao="Como os valores se comportam ao longo do tempo e onde a glosa se concentra."
          cor="#fff"
        />
      )}

      {/* GRÁFICO TEMPORAL */}
      {chartMensal.length > 0 && (
        <div className="card animated-card" style={cardStyle}>
          <h3>Cobrado vs Liberado por Mês</h3>
          <p className="grafico-legenda" style={{ color: cores.texto }}>
            Barras comparam o valor cobrado e o liberado a cada mês; a linha roxa mostra a glosa do período.
          </p>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={chartMensal}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
                <XAxis dataKey="mes" stroke={cores.texto} tick={{ fontSize: 11 }} />
                <YAxis stroke={cores.texto} tick={{ fontSize: 11 }} tickFormatter={formatarMoedaCompactaBR} />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => formatarMoedaBR(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="cobrado" name="Valor Cobrado" fill={corSecundaria} radius={[4, 4, 0, 0]} />
                <Bar dataKey="liberado" name="Valor Liberado" fill={accentColor} radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="glosa" name="Glosa" stroke={corTerceira} strokeWidth={2} dot={{ r: 4, fill: corTerceira }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* COMPOSIÇÃO E COMPARAÇÃO POR DIMENSÃO */}
      {dados.length > 0 && (
        <div className="graficos-grid">
          {composicaoTipoCompra.length > 0 && (
            <div className="card animated-card" style={cardStyle}>
              <h3>Participação na Glosa por Tipo de Compra</h3>
              <p className="grafico-legenda" style={{ color: cores.texto }}>
                Fatia de cada tipo de compra no total de glosa — evidencia onde estão as maiores perdas.
              </p>
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={composicaoTipoCompra}
                      dataKey="valor"
                      nameKey="nome"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      label={renderRotuloRosca}
                      labelLine={{ stroke: cores.texto, strokeOpacity: 0.4 }}
                    >
                      {composicaoTipoCompra.map((f, i) => (
                        <Cell key={f.nome} fill={PALETA[i % PALETA.length]} stroke={cores.card} strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ fontSize: 12 }}
                      formatter={(v, n, item) => [
                        `${formatarMoedaBR(v)} · ${formatarPercentualBR(item?.payload?.pct)}`,
                        n,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {macroCobradoLiberado.length > 0 && (
            <div className="card animated-card" style={cardStyle}>
              <h3>Cobrado vs Liberado por Macrorregião</h3>
              <p className="grafico-legenda" style={{ color: cores.texto }}>
                Compara cobrado e liberado em cada macrorregião — a diferença entre as barras é a glosa.
              </p>
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={macroCobradoLiberado}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
                    <XAxis dataKey="nome" stroke={cores.texto} tick={{ fontSize: 11 }} />
                    <YAxis stroke={cores.texto} tick={{ fontSize: 11 }} tickFormatter={formatarMoedaCompactaBR} />
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => formatarMoedaBR(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="cobrado" name="Valor Cobrado" fill={corSecundaria} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="liberado" name="Valor Liberado" fill={accentColor} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* RANKINGS (seguem o seletor de métrica) */}
      {dados.length > 0 && (
        <>
          <SecaoTitulo
            titulo="Rankings"
            descricao="Os 10 maiores por CID e por prestador. Troque a métrica abaixo para ordenar por glosa, valor, permanência ou custo."
            cor="#fff"
          />
          <div className="filtro" style={{ marginTop: 16 }}>
            <div className="linha-filtros">
              <div className="grupo-filtro">
                <label>Métrica dos rankings:</label>
                <select
                  className="filtro-processo"
                  value={metrica}
                  onChange={(e) => setMetrica(e.target.value)}
                >
                  {Object.entries(METRICAS).map(([k, m]) => (
                    <option key={k} value={k}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="graficos-grid">
            {graficosRanking.map((g) => g.dados.length > 0 && (
              <div key={g.titulo} className="card animated-card" style={cardStyle}>
                <h3>{METRICAS[metrica].label} {g.titulo}</h3>
                <div style={{ width: "100%", height: g.altura }}>
                  <ResponsiveContainer>
                    <BarChart data={g.dados.map((d) => ({ ...d, nome: truncar(d.nome, g.maxNome) }))} layout="vertical">
                      <XAxis type="number" stroke={cores.texto} tick={{ fontSize: 11 }} tickFormatter={METRICAS[metrica].fmtEixo} />
                      <YAxis type="category" dataKey="nome" width={g.yWidth} stroke={cores.texto} tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => METRICAS[metrica].fmt(v)} />
                      <Bar dataKey="valor" fill={accentColor} name={METRICAS[metrica].label} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* FILTROS */}
      <SecaoTitulo
        titulo="Filtros e detalhamento"
        descricao="Refine por busca, prestador, macrorregião, tipo de compra ou período. A tabela lista cada parecer e pode ser exportada em Excel."
        cor="#fff"
      />
      <div className="filtro" style={{ marginTop: 16 }}>
        <div className="linha-filtros">
          <div className="grupo-filtro">
            <label>Buscar:</label>
            <input
              className="filtro-processo"
              type="text"
              placeholder="Ofício, conta ou prestador"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="grupo-filtro">
            <label>Prestador:</label>
            <select
              className="filtro-processo"
              value={filtroPrestador}
              onChange={(e) => setFiltroPrestador(e.target.value)}
            >
              <option value="">Todos</option>
              {prestadores.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="grupo-filtro">
            <label>Macrorregião:</label>
            <select
              className="filtro-processo"
              value={filtroMacro}
              onChange={(e) => setFiltroMacro(e.target.value)}
            >
              <option value="">Todas</option>
              {macros.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="grupo-filtro">
            <label>Tipo de Compra:</label>
            <select
              className="filtro-processo"
              value={filtroTipoCompra}
              onChange={(e) => setFiltroTipoCompra(e.target.value)}
            >
              <option value="">Todos</option>
              {tiposCompra.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="grupo-filtro">
            <label>Período:</label>
            <input
              className="filtro-data"
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
            <span className="ate-text">até</span>
            <input
              className="filtro-data"
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
            />
          </div>
          <button className="btn-tema" onClick={limparFiltros}>
            <span className="material-symbols-outlined">mop</span>
            Limpar Filtros
          </button>
        </div>
      </div>

      {/* TABELA */}
      <div className="tabela-container" style={{ backgroundColor: cores.card, color: cores.texto, marginTop: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid rgba(128,128,128,0.2)" }}>
          <h3 style={{ margin: 0 }}>Detalhamento</h3>
          <span style={{ fontSize: "13px", opacity: 0.8 }}>
            Mostrando {filtrados.length === 0 ? 0 : inicio + 1}—{Math.min(inicio + ITENS_POR_PAGINA, filtrados.length)} de {filtrados.length.toLocaleString("pt-BR")}
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ color: cores.texto }}>Nº Ofício</th>
                <th style={{ color: cores.texto }}>Data Parecer</th>
                <th style={{ color: cores.texto }}>Processado em</th>
                <th style={{ color: cores.texto }}>Nº Conta</th>
                <th style={{ color: cores.texto }}>Prestador</th>
                <th style={{ color: cores.texto }}>Macrorregião</th>
                <th style={{ color: cores.texto }}>Tipo Compra</th>
                <th style={{ color: cores.texto }}>CID</th>
                <th style={{ color: cores.texto }}>Dias Intern.</th>
                <th style={{ color: cores.texto }}>V. Cobrado</th>
                <th style={{ color: cores.texto }}>V. Liberado</th>
                <th style={{ color: cores.texto }}>Glosa</th>
                <th style={{ color: cores.texto }}>% Glosa</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13} style={{ color: cores.texto, padding: 32 }}>Carregando...</td></tr>
              ) : filtrados.length === 0 ? (
                <tr><td colSpan={13} style={{ color: cores.texto, padding: 32 }}>Nenhum registro encontrado.</td></tr>
              ) : paginaDados.map((r) => (
                <tr key={r.id}>
                  <td style={{ color: cores.texto }}>{r.numero_oficio || "—"}</td>
                  <td style={{ color: cores.texto }}>{formatarDataBR(r.data_parecer)}</td>
                  <td style={{ color: cores.texto }}>{formatarDataHora(r.created_at)}</td>
                  <td style={{ color: cores.texto }}>{r.numero_conta || "—"}</td>
                  <td style={{ color: cores.texto }}>{r.prestador || "—"}</td>
                  <td style={{ color: cores.texto }}>{r.macrorregiao || "—"}</td>
                  <td style={{ color: cores.texto }}>{r.tipo_compra || "—"}</td>
                  <td style={{ color: cores.texto }}>{r.cid || "—"}</td>
                  <td style={{ color: cores.texto }}>{num(r.dias_internacao) ?? "—"}</td>
                  <td style={{ color: cores.texto }}>{formatarMoedaBR(r.valor_cobrado)}</td>
                  <td style={{ color: cores.texto }}>{formatarMoedaBR(r.valor_liberado)}</td>
                  <td style={{ color: cores.texto }}>{formatarMoedaBR(r.valor_glosa)}</td>
                  <td style={{ color: cores.texto }}>{formatarPercentualBR(r.percentual_glosa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPaginas > 1 && (
          <div className="paginacao" style={{ borderTop: "1px solid rgba(128,128,128,0.2)" }}>
            <button className="paginacao-btn" onClick={() => irParaPagina(paginaSegura - 1)} disabled={paginaSegura <= 1}
              style={{ background: tema === "escuro" ? "#374151" : "#e5e7eb", color: cores.texto, fontWeight: "bold", padding: "6px 12px" }}>
              Anterior
            </button>
            {paginasVisiveis[0] > 1 && (
              <>
                <button className="paginacao-btn" onClick={() => irParaPagina(1)} style={{ background: cores.card, color: cores.texto }}>1</button>
                {paginasVisiveis[0] > 2 && <span style={{ color: cores.texto, opacity: 0.5 }}>...</span>}
              </>
            )}
            {paginasVisiveis.map(p => (
              <button key={p} className={`paginacao-btn ${p === paginaSegura ? "paginacao-ativa" : ""}`}
                onClick={() => irParaPagina(p)}
                style={{ background: p === paginaSegura ? accentColor : (tema === "escuro" ? "#374151" : "#e5e7eb"), color: p === paginaSegura ? "#fff" : cores.texto }}>
                {p}
              </button>
            ))}
            {paginasVisiveis[paginasVisiveis.length - 1] < totalPaginas && (
              <>
                {paginasVisiveis[paginasVisiveis.length - 1] < totalPaginas - 1 && <span style={{ color: cores.texto, opacity: 0.5 }}>...</span>}
                <button className="paginacao-btn" onClick={() => irParaPagina(totalPaginas)} style={{ background: cores.card, color: cores.texto }}>{totalPaginas}</button>
              </>
            )}
            <button className="paginacao-btn" onClick={() => irParaPagina(paginaSegura + 1)} disabled={paginaSegura >= totalPaginas}
              style={{ background: tema === "escuro" ? "#374151" : "#e5e7eb", color: cores.texto, fontWeight: "bold", padding: "6px 12px" }}>
              Próximo
            </button>
          </div>
        )}
      </div>

      {/* AÇÕES */}
      <div className="acoes-tabela">
        <button className="btn-tema" onClick={exportarExcel}>
          <span className="material-symbols-outlined">download</span>
          Exportar Planilha
        </button>
      </div>
    </>
  );
}
