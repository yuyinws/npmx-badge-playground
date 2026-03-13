// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@vueuse/nuxt'],
  ssr: false,

  devtools: {
    enabled: true
  },
  app: {
    head: {
      title: 'Npmx Badges Playground',
      htmlAttrs: {
        lang: 'en'
      },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'A playground for npmx badges.' },
        { property: 'og:title', content: 'Npmx Badges Playground' },
        { property: 'og:description', content: 'A playground for npmx badges.' },
        { property: 'og:image', content: 'https://npmx-badge.vercel.app/og.png' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:image', content: 'https://npmx-badge.vercel.app/og.png' }
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico' }
      ]
    }
  },

  css: ['~/assets/css/main.css'],

  routeRules: {
    '/': { prerender: true }
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
