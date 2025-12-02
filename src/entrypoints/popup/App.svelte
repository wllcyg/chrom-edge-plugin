<script lang="ts">
  import extractorIcon from "../../assets/extractor-icon.svg";
  import { Image, Download, Package, Settings } from 'lucide-svelte';
  import Counter from "../../lib/Counter.svelte";

  // 模拟数据，实际使用时应该从content script或其他地方获取
  let stats = {
    totalImages: 42,
    selectedImages: 15,
    downloadedImages: 8,
    categories: ['商品主图', '商品详情', '买家评价', '缩略图'],
    isLoading: false
  };

  // 功能按钮
  function openExtractor() {
    // 发送消息到content script开始提取图片
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'START_EXTRACTION' });
      }
    });
  }

  function openSettings() {
    // 打开设置页面
    chrome.runtime.openOptionsPage();
  }
</script>

<main>
  <!-- 头部标题区域 -->
  <div class="header-section">
    <div class="logo-container">
      <img src={extractorIcon} alt="电商图片抓取器" class="app-icon" />
    </div>
    <h1 class="app-title">电商图片抓取器</h1>
    <p class="app-description">智能识别并批量下载商品图片</p>
  </div>

  <!-- 统计面板 -->
  <div class="card">
    <Counter
      totalImages={stats.totalImages}
      selectedImages={stats.selectedImages}
      downloadedImages={stats.downloadedImages}
      categories={stats.categories}
      isLoading={stats.isLoading}
    />
  </div>

  <!-- 功能按钮 -->
  <div class="action-buttons">
    <button on:click={openExtractor} class="primary-btn">
      <Image class="btn-icon" />
      开始抓取
    </button>
    <button on:click={openSettings} class="secondary-btn">
      <Settings class="btn-icon" />
      设置
    </button>
  </div>

  <!-- 快速链接 -->
  <div class="quick-links">
    <button type="button" class="quick-link" on:click={() => console.log('最近下载')}>
      <Download class="link-icon" />
      <span>最近下载</span>
    </button>
    <button type="button" class="quick-link" on:click={() => console.log('图片管理')}>
      <Package class="link-icon" />
      <span>图片管理</span>
    </button>
  </div>
</main>

<style lang="css">
  :global(body) {
    min-width: 320px;
    min-height: 500px;
    padding: 0;
    margin: 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  main {
    padding: 1.5rem;
    max-width: 400px;
    margin: 0 auto;
  }

  /* 头部样式 */
  .header-section {
    text-align: center;
    margin-bottom: 2rem;
  }

  .logo-container {
    margin-bottom: 1rem;
  }

  .app-icon {
    width: 80px;
    height: 80px;
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1));
    transition: transform 0.3s ease;
  }

  .app-icon:hover {
    transform: scale(1.05);
  }

  .app-title {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0 0 0.5rem 0;
    background: linear-gradient(45deg, #ffffff, #f0f0f0);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .app-description {
    font-size: 0.9rem;
    opacity: 0.9;
    margin: 0;
    color: rgba(255, 255, 255, 0.8);
  }

  /* 卡片样式 */
  .card {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border-radius: 1rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }

  /* 按钮样式 */
  .action-buttons {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .primary-btn, .secondary-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border-radius: 0.75rem;
    border: none;
    padding: 0.75rem 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 0.9rem;
  }

  .primary-btn {
    background: linear-gradient(45deg, #3b82f6, #8b5cf6);
    color: white;
    box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
  }

  .primary-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(59, 130, 246, 0.6);
  }

  .secondary-btn {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  .secondary-btn:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: translateY(-1px);
  }

  /* 按钮图标样式 */
  .primary-btn :global(svg), .secondary-btn :global(svg) {
    width: 1.2rem;
    height: 1.2rem;
  }

  /* 快速链接样式 */
  .quick-links {
    display: flex;
    gap: 1rem;
    justify-content: center;
  }

  .quick-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2rem;
    text-decoration: none;
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.85rem;
    transition: all 0.3s ease;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .quick-link:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
    color: white;
  }

  .quick-link :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  /* 响应式设计 */
  @media (max-width: 360px) {
    main {
      padding: 1rem;
    }

    .app-icon {
      width: 60px;
      height: 60px;
    }

    .app-title {
      font-size: 1.3rem;
    }

    .action-buttons {
      grid-template-columns: 1fr;
    }

    .quick-links {
      flex-direction: column;
    }
  }
</style>
