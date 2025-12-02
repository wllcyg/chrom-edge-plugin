import '../styles/global.css';

export default defineContentScript({
  matches: [
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
  ],
  main() {
    console.log('图片抓取扩展已加载');

    // 等待页面加载完成
    function waitForPageLoad() {
      if (document.readyState === 'complete') {
        injectToolbar();
      } else {
        window.addEventListener('load', injectToolbar);
      }
    }

    // 注入工具栏
    function injectToolbar() {
      // 检查是否已经注入过
      if (document.getElementById('image-extractor-root')) {
        return;
      }

      // 创建根容器
      const root = document.createElement('div');
      root.id = 'image-extractor-root';
      document.body.appendChild(root);

      // 动态导入并挂载Svelte组件
      import('../components/Toolbar.svelte').then(({ default: Toolbar }) => {
        new Toolbar({
          target: root
        });
      }).catch(error => {
        console.error('加载工具栏失败:', error);
      });
    }

    // 监听来自工具栏的消息
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data.type) return;

      switch (event.data.type) {
        case 'IMAGES_EXTRACTED':
          console.log('图片提取完成:', event.data.images);
          // 可以在这里添加额外的处理逻辑
          break;
      }
    });

    // 页面变化时重新检查
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // 检查是否需要重新注入工具栏（SPA页面切换）
          const hasRoot = document.getElementById('image-extractor-root');
          if (!hasRoot && isProductPage()) {
            setTimeout(injectToolbar, 1000);
          }
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // 启动
    waitForPageLoad();
  },
});

// 辅助函数：检查是否在商品详情页
function isProductPage(): boolean {
  const url = window.location.href;
  const productKeywords = ['item', 'product', 'goods', 'detail'];
  const hasProductKeyword = productKeywords.some(keyword =>
    url.toLowerCase().includes(keyword)
  );

  // 检查页面是否包含商品相关元素
  const hasProductElements = document.querySelector(
    '.price, .product-price, .goods-price, .product-name, .product-title, ' +
    '[class*="price"], [class*="product"], [data-sku]'
  );

  return hasProductKeyword || hasProductElements;
}
