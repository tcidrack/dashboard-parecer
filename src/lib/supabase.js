import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Sem as env vars o createClient lança na avaliação do módulo e o React nunca
// monta — a tela fica em branco sem pista nenhuma. O log diz o que fazer antes.
if (!supabaseUrl || !supabaseKey) {
  const faltando = [
    !supabaseUrl && 'VITE_SUPABASE_URL',
    !supabaseKey && 'VITE_SUPABASE_ANON_KEY',
  ].filter(Boolean).join(', ')
  console.error(
    `[supabase] Variáveis de ambiente ausentes: ${faltando}. ` +
    `Crie um .env na raiz do projeto (veja .env.example) e reinicie o servidor ` +
    `do Vite — o .env só é lido na inicialização.`
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: { params: { eventsPerSecond: 0 } },
})
