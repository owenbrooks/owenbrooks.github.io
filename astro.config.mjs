// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
    site: 'https://owenbrooks.github.io',
    integrations: [mdx(), sitemap()],
    markdown: {
        shikiConfig: {
            // theme: 'gruvbox-dark-medium',
            // theme: 'laserwave',
            theme: 'one-dark-pro',
        },
    },
});
