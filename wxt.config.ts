import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'TweetBase',
    description: 'Save and organise tweets in folders, stored locally.',
    permissions: ['storage'],
    host_permissions: ['*://x.com/*', '*://twitter.com/*'],
  },
});
