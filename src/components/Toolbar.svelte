<script lang="ts">
  import { Image, Download, X, ChevronLeft } from 'lucide-svelte';
  import ImagePanel from './ImagePanel.svelte';

  let showImagePanel = false;
  let extractedImages: any[] = [];
  let isExtracting = false;

  // 提取图片函数
  async function extractImages() {
    isExtracting = true;

    try {
      // 获取所有图片元素
      const allImages = document.querySelectorAll('img');
      const images: any[] = [];

      // 分类图片
      allImages.forEach((img, index) => {
        const src = img.src || img.getAttribute('data-src') || '';
        const alt = img.alt || `图片 ${index + 1}`;
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;

        if (src && !src.includes('data:image')) {
          // 根据尺寸和位置判断图片类型
          let category = '其他图片';

          // 主图：通常在商品展示区域，尺寸较大
          if (width > 400 && height > 400) {
            category = '商品主图';
          }
          // 详情图：在详情描述区域
          else if (img.closest('.detail-content, .product-detail, .description')) {
            category = '商品详情';
          }
          // 评价图片：在评价区域
          else if (img.closest('.review, .comment, .rating')) {
            category = '买家评价';
          }
          // 缩略图
          else if (width < 150 && height < 150) {
            category = '缩略图';
          }

          images.push({
            src,
            alt,
            width,
            height,
            category,
            index
          });
        }
      });

      extractedImages = images;
      showImagePanel = true;

      // 发送消息到content script
      window.postMessage({
        type: 'IMAGES_EXTRACTED',
        images: images
      }, '*');

    } catch (error) {
      console.error('提取图片失败:', error);
    } finally {
      isExtracting = false;
    }
  }

  // 关闭图片面板
  function closeImagePanel() {
    showImagePanel = false;
  }

  // 检查是否在电商网站
  function isEcommerceSite(): boolean {
    const hostname = window.location.hostname;
    const ecommerceDomains = [
      'taobao.com', 'tmall.com', 'jd.com', 'amazon.',
      'suning.com', 'pinduoduo.com', 'vip.com',
      'dangdang.com', 'yhd.com'
    ];

    return ecommerceDomains.some(domain => hostname.includes(domain));
  }

  // 检查是否在商品详情页
  function isProductPage(): boolean {
    const url = window.location.href;
    const productKeywords = ['item', 'product', 'goods', 'detail'];
    const hasProductKeyword = productKeywords.some(keyword =>
      url.toLowerCase().includes(keyword)
    );

    // 检查页面是否包含商品相关元素
    const hasProductElements = document.querySelector(
      '.price, .product-price, .goods-price, .product-name, .product-title'
    );

    return hasProductKeyword || hasProductElements;
  }
</script>

{#if isEcommerceSite() && isProductPage()}
  <!-- 浮动工具栏 -->
  <div class="fixed top-1/2 right-4 transform -translate-y-1/2 z-high animate-fade-in">
    <div class="glass-effect rounded-2xl shadow-soft p-2 space-y-2">
      <button
        on:click={extractImages}
        disabled={isExtracting}
        class="group relative gradient-primary text-white p-3 rounded-xl hover:shadow-lg transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
        title="抓取页面图片"
      >
        {#if isExtracting}
          <div class="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full"></div>
        {:else}
          <Image class="w-5 h-5" />
        {/if}

        <!-- 悬停提示 -->
        <div class="absolute right-full mr-2 top-1/2 transform -translate-y-1/2 bg-gray-900 text-white px-3 py-1 rounded-lg text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          {isExtracting ? '正在抓取...' : '抓取图片'}
        </div>
      </button>

      {#if extractedImages.length > 0}
        <button
          on:click={() => showImagePanel = true}
          class="relative bg-green-500 text-white p-3 rounded-xl hover:bg-green-600 hover:shadow-lg transition-all duration-300 hover:scale-105"
          title="查看抓取的图片"
        >
          <div class="relative">
            <Image class="w-5 h-5" />
            <span class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
              {extractedImages.length}
            </span>
          </div>
        </button>
      {/if}
    </div>
  </div>

  <!-- 图片展示面板 -->
  {#if showImagePanel}
    <ImagePanel
      images={extractedImages}
      onClose={closeImagePanel}
    />
  {/if}
{/if}

<style lang="css">
  /* 确保样式不与页面冲突 */
  :global(.fixed) {
    position: fixed !important;
  }

  :global(.z-high) {
    z-index: 10000 !important;
  }
</style>