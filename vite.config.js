import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Caminhos relativos nos assets do build: o dist/ funciona servido da raiz,
  // de um subdiretório ou aberto direto do disco (file://).
  base: './',
  plugins: [react()],
})
