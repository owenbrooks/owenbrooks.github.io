// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://owenbrooks.org',
  integrations: [mdx(), sitemap()],

  markdown: {
    shikiConfig: {
      theme: 'one-dark-pro',
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },

  redirects: {
    "/": {
      status: 302,
      destination: "/blog",
    },
  }
});
