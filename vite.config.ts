// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// If your repo is "<you>/slinger", keep base as '/slinger/'.
// If your repo is "<you>/<you>.github.io", change to base: '/'.
export default defineConfig({
  plugins: [react()],
  base: '/slinger/',
})
