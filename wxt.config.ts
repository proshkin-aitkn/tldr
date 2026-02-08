import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'TL;DR',
    description: 'Summarize any page or YouTube video with AI — image analysis, diagrams, and chat. Bring your own key, no subscription needed.',
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    action: {
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
        48: 'icons/icon-48.png',
        128: 'icons/icon-128.png',
      },
    },
    permissions: ['sidePanel', 'activeTab', 'storage', 'scripting', 'tabs'],
    host_permissions: ['<all_urls>'],
  },
  vite: () => ({
    plugins: [preact()],
  }),
});
