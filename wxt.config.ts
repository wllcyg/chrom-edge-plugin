import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  vite: () => ({
    css: {
      postcss: {
        plugins: [
          require('@tailwindcss/postcss'),
          require('autoprefixer'),
        ],
      },
    },
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  }),
  manifest: {
    name: '电商图片抓取器',
    description: '智能识别电商网站商品图片，支持批量下载和分类管理',
    version: '1.0.0',
    permissions: [
      'activeTab',
      'downloads',
      'storage'
    ],
    host_permissions: [
      '*://*.taobao.com/*',
      '*://*.tmall.com/*',
      '*://*.jd.com/*',
      '*://*.amazon.com/*',
      '*://*.amazon.cn/*',
      '*://*.suning.com/*',
      '*://*.pinduoduo.com/*',
      '*://*.vip.com/*',
      '*://*.dangdang.com/*',
      '*://*.yhd.com/*'
    ]
  }
});
