import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Twitter Bookmarker',
    description: 'Save tweets into local folders.',
    permissions: ['storage'],
    host_permissions: ['*://x.com/*', '*://twitter.com/*'],
  },
});
