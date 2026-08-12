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

## Deploy (Vercel)

O projeto está hospedado na Vercel, ligado à branch `main` deste repositório: todo push na
`main` dispara um novo build e publica sozinho. Preset **Vite** (build `npm run build`, saída
`dist/`) — não há `vercel.json`, os padrões já bastam.

As duas variáveis do `.env` precisam existir também no painel da Vercel
(*Settings → Environment Variables*), nos escopos Production, Preview e Development:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Atenção: o Vite injeta as `VITE_*` em tempo de **build**, não de runtime. Se elas faltarem, o
site sobe e renderiza normalmente, mas nunca carrega dado nenhum — `src/lib/supabase.js` só
registra um `console.error`. Depois de alterar uma variável é preciso **redeployar** para o
valor novo entrar no bundle.

O `base: './'` do `vite.config.js` é proposital (assets com caminho relativo) e funciona tanto
servido da raiz do domínio quanto entregue como pasta `dist/`. Não precisa mudar.

### Sobre a exposição dos dados

A URL de produção é **pública** — não há tela de login. A tabela `pareceres` é legível pela
chave `anon`, o que inclui colunas de nível individual (`cid`, `idade_paciente`,
`data_internacao`, `data_alta`, `numero_susfacil`, `numero_laudo`, `numero_conta`). Isso é uma
decisão consciente, não descuido: o painel foi feito para apresentação ao cliente.

A escrita, essa sim, está fechada — a role `anon` tem apenas `SELECT` na tabela, com RLS
habilitado. Se um dia a exposição da leitura incomodar, os dois caminhos são proteger a URL
por senha (exige plano Pro da Vercel) ou publicar uma view agregada, sem CID, idade e IDs de
conta.

## Personalização

- **Título/logo**: em `src/App.jsx` (header) e `index.html` (`<title>`).
- **Período inicial**: abre no mês corrente (`primeiroDiaDoMesBR` em `src/tabs/Pareceres.jsx`).
  Limpar os filtros faz os cards mostrarem o total geral de toda a base.
- **Textos explicativos**: banner de introdução e glossário em `src/App.jsx`; legendas dos
  gráficos em `src/tabs/Pareceres.jsx`.
