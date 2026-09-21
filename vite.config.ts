import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    watch: {
      ignored: ['**/public/**/*.exe'],
    },
  },
  preview: {
    host: true,
    port: 4173,
  },
})
