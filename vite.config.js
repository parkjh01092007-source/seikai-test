import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/seikai-test/', // GitHub Pages の公開パス（リポジトリ名）
  plugins: [react()],
})
