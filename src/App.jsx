import { useEffect, useState } from "react";
import "./App.css";
import Pareceres from "./tabs/Pareceres";

export default function App() {
  const [tema, setTema] = useState(() => localStorage.getItem("tema") || "claro");

  const cores = {
    claro: { fundo: "#0070FF", card: "#E5F0FF", texto: "#000" },
    escuro: { fundo: "#111827", card: "#1E293B", texto: "#fff" },
  };

  useEffect(() => {
    localStorage.setItem("tema", tema);
  }, [tema]);

  function trocarTema() {
    setTema(tema === "claro" ? "escuro" : "claro");
  }

  const coresAtivas = cores[tema];

  return (
    <div
      className={`container ${tema === "escuro" ? "tema-escuro" : "tema-claro"}`}
      style={{ backgroundColor: coresAtivas.fundo }}
    >
      {/* GOOGLE MATERIAL ICONS */}
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined"
        rel="stylesheet"
      />

      {/* HEADER */}
      <div className="header">
        <div className="logo-area">
          <img
            src="https://maida.health/wp-content/themes/melhortema/assets/images/logo-light.svg"
            alt="Logo Maida"
          />
          <h1>Dashboard de Pareceres · Auditoria de Contas</h1>
        </div>

        <div className="acoes-header">
          <button className="btn-tema btn-tema-toggle" onClick={trocarTema}>
            <span className="material-symbols-outlined">
              {tema === "claro" ? "bedtime" : "brightness_7"}
            </span>
            {tema === "claro" ? "Escuro" : "Claro"}
          </button>
        </div>
      </div>

      {/* INTRODUÇÃO / CONTEXTO PARA APRESENTAÇÃO */}
      <div className="intro-banner" style={{ backgroundColor: coresAtivas.card, color: coresAtivas.texto }}>
        <h2>Como ler este painel</h2>
        <p>
          Este dashboard acompanha a <strong>auditoria de contas hospitalares</strong>: compara o
          valor <strong>cobrado</strong> pelos prestadores com o valor efetivamente{" "}
          <strong>liberado</strong> após a análise, evidencia as <strong>glosas</strong> (valores não
          reconhecidos) e mede a <strong>permanência</strong> e o <strong>custo médio</strong> das
          internações. Os indicadores no topo resumem o período; os gráficos mostram a evolução e a
          composição; e a tabela detalha cada parecer. Use os filtros para recortar por prestador,
          macrorregião, tipo de compra ou intervalo de datas — os dados são atualizados
          automaticamente.
        </p>
      </div>

      {/* CONTEÚDO — DASHBOARD DE PARECERES */}
      <Pareceres tema={tema} cores={coresAtivas} />

      {/* GLOSSÁRIO */}
      <div className="glossario" style={{ backgroundColor: coresAtivas.card, color: coresAtivas.texto }}>
        <h2>Glossário dos indicadores</h2>
        <dl>
          <div>
            <dt>Faturas auditadas</dt>
            <dd>Quantidade de pareceres (contas) analisados no período filtrado.</dd>
          </div>
          <div>
            <dt>Valor cobrado</dt>
            <dd>Soma dos valores apresentados pelos prestadores antes da auditoria.</dd>
          </div>
          <div>
            <dt>Valor liberado</dt>
            <dd>Soma dos valores reconhecidos e liberados após a auditoria.</dd>
          </div>
          <div>
            <dt>Glosa</dt>
            <dd>Valor não reconhecido na auditoria (cobrado que não foi liberado).</dd>
          </div>
          <div>
            <dt>% Glosado</dt>
            <dd>Participação da glosa sobre o cobrado (Σ glosa ÷ Σ cobrado).</dd>
          </div>
          <div>
            <dt>Permanência média</dt>
            <dd>Média de dias de internação, considerando apenas contas com dias informados.</dd>
          </div>
          <div>
            <dt>Custo médio por dia</dt>
            <dd>Valor liberado dividido pelo total de dias de internação (Σ liberado ÷ Σ dias).</dd>
          </div>
          <div>
            <dt>Custo médio por internação</dt>
            <dd>Valor liberado médio por fatura (Σ liberado ÷ nº de faturas com valor).</dd>
          </div>
        </dl>
      </div>

      {/* RODAPÉ */}
      <footer className="rodape" style={{ color: "#fff" }}>
        maida.health · Painel de acompanhamento de auditoria de contas
      </footer>
    </div>
  );
}
