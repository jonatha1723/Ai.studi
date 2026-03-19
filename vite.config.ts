import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['icon.svg'],
        manifest: {
          name: 'Galeria Segura',
          short_name: 'Galeria',
          description: 'Armazenamento em nuvem com criptografia de ponta a ponta.',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          categories: ['productivity', 'utilities'],
          icons: [
            {
              src: 'icon.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              purpose: 'any'
            },
            {
              src: 'icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any'
            },
            {
              src: 'icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'maskable'
            }
          ],
          screenshots: [
            {
              src: 'https://picsum.photos/seed/gallery/1080/1920',
              sizes: '1080x1920',
              type: 'image/jpeg',
              form_factor: 'narrow',
              label: 'Galeria Segura no Celular'
            },
            {
              src: 'https://picsum.photos/seed/gallery/1920/1080',
              sizes: '1920x1080',
              type: 'image/jpeg',
              form_factor: 'wide',
              label: 'Galeria Segura no Computador'
            }
          ]
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'firebase-config': fs.existsSync(path.resolve(__dirname, 'firebase-applet-config.json')) 
          ? path.resolve(__dirname, 'firebase-applet-config.json') 
          : path.resolve(__dirname, 'empty-config.json')
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
