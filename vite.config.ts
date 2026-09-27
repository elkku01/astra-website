import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { cosmeticsStoreApi } from './server/cosmeticsStore.ts'

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://minotar.net https://crafatar.com https://textures.minecraft.net https://cdn.tebex.io https://mc-heads.net https://crafthead.net",
  "connect-src 'self' https://headless.tebex.io https://checkout.tebex.io https://api.github.com https://api.modrinth.com https://piston-meta.mojang.com https://login.microsoftonline.com https://discordstatus.com https://playerdb.co https://minotar.net https://crafatar.com https://api.ashcon.app https://api.minetools.eu https://mc-heads.net https://textures.minecraft.net https://crafthead.net https://*.workers.dev https://*.deno.dev",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.tebex.io https://pay.tebex.io https://*.tebex.io",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ')

function applySecurityHeaders(_req: IncomingMessage, res: ServerResponse, next: () => void) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  )
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  next()
}

function securityHeaders(): Plugin {
  return {
    name: 'security-headers',
    configureServer(server) {
      server.middlewares.use(applySecurityHeaders)
    },
    configurePreviewServer(server) {
      server.middlewares.use(applySecurityHeaders)
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (ctx.server) return html
        if (html.includes('Content-Security-Policy')) return html
        return html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
        )
      },
    },
  }
}

function ghPagesFallback(): Plugin {
  return {
    name: 'gh-pages-fallback',
    closeBundle() {
      const index = path.resolve('dist/index.html')
      if (fs.existsSync(index)) {
        fs.copyFileSync(index, path.resolve('dist/404.html'))
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: process.env.VITE_BASE || env.VITE_BASE || '/',
    plugins: [
      react(),
      cosmeticsStoreApi({
        adminPassword: env.ADMIN_PASSWORD || '',
        tebexPublicToken: env.VITE_TEBEX_PUBLIC_TOKEN || '',
        collectionSlug: env.VITE_TEBEX_COLLECTION_SLUG || 'collection',
        collectionLimit: 100,
      }),
      securityHeaders(),
      ghPagesFallback(),
    ],
    optimizeDeps: {
      include: ['skinview3d', 'three'],
    },
    server: {
      host: true,
      port: 5173,
      watch: {
        ignored: ['**/public/**/*.exe', '**/public/skins/**'],
      },
    },
    preview: {
      host: true,
      port: 4173,
    },
  }
})
