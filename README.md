# Dashboard de Pareceres — Auditoria de Contas

Painel standalone (React + Vite) para **apresentação e monitoramento** dos pareceres de
auditoria de contas. Mostra os mesmos dados da aba Pareceres do dashboard interno, ao vivo,
com uma camada explicativa voltada ao cliente.

## O que mostra

- **Indicadores** do período: faturas auditadas, permanência média, custo por dia/internação,
  valor cobrado, valor liberado, glosa e % glosado.
- **Evolução e composição**: cobrado × liberado por mês, participação da glosa por tipo de
  compra e comparação por macrorregião.
- **Rankings** por CID e por prestador (métrica configurável).
- **Detalhamento** em tabela paginada, com exportação para Excel.
- **Glossário** dos indicadores.

Dados ao vivo do Supabase, atualizados automaticamente a cada 2 minutos.

## Como rodar

Pré-requisito: Node.js 18+.

```bash
npm install
npm run dev      # ambiente de desenvolvimento (http://localhost:5173)
```

Para gerar a versão de produção (a pasta `dist/` é o que se hospeda/entrega):

```bash
npm run build
npm run preview  # confere o build localmente
```

## Configuração (.env)

As credenciais ficam em `.env` (veja `.env.example`). São as **mesmas** chaves públicas (anon)
usadas pelo dashboard interno:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

A chave `anon` é pública por design (fica no bundle do navegador). O acesso aos dados é
controlado pelas políticas de RLS da tabela `pareceres` no Supabase.

## Personalização

- **Título/logo**: em `src/App.jsx` (header) e `index.html` (`<title>`).
- **Período inicial**: abre no mês corrente (`primeiroDiaDoMesBR` em `src/tabs/Pareceres.jsx`).
  Limpar os filtros faz os cards mostrarem o total geral de toda a base.
- **Textos explicativos**: banner de introdução e glossário em `src/App.jsx`; legendas dos
  gráficos em `src/tabs/Pareceres.jsx`.
