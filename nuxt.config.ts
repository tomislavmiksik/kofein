// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vite-pwa/nuxt',
    // Only load Supabase when real credentials are provided
    ...(process.env.SUPABASE_URL && !process.env.SUPABASE_URL.startsWith('your-')
      ? ['@nuxtjs/supabase']
      : []),
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  routeRules: {
    '/': { ssr: false },
  },

  ...(process.env.SUPABASE_URL && !process.env.SUPABASE_URL.startsWith('your-') ? {
    supabase: {
      redirectOptions: {
        login: '/login',
        callback: '/confirm',
        exclude: ['/'],
      },
    },
  } : {}),

  nitro: {
    preset: process.env.VERCEL ? 'vercel' : 'node-server',
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  pwa: {
    manifest: {
      name: 'Kofein',
      short_name: 'Kofein',
      description: 'Track caffeine, protect your sleep',
      theme_color: '#f59e0b',
      background_color: '#ffffff',
      display: 'standalone',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    workbox: {
      navigateFallback: '/',
    },
    devOptions: {
      enabled: true,
      type: 'module',
    },
  },
})
