import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/seikai-test/', // GitHub Pages の公開パス（リポジトリ名）
  plugins: [react()],
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) }, // ビルドした日時（設定 → 一般 の版。spec-pwa.md 5章）
})
