<script lang="ts">
  import { X, Download, Search, Filter, Grid, List, CheckSquare, Square, Image as ImageIcon } from 'lucide-svelte';

  export let images: any[] = [];
  export let onClose: () => void;

  let searchTerm = '';
  let selectedCategory = '全部';
  let viewMode = 'grid'; // grid or list
  let selectedImages = new Set();

  // 获取所有分类
  $: categories = ['全部', ...new Set(images.map(img => img.category))];

  // 过滤图片
  $: filteredImages = images.filter(img => {
    const matchesSearch = img.alt.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          img.src.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === '全部' || img.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // 按分类分组图片
  $: groupedImages = filteredImages.reduce((acc, img) => {
    if (!acc[img.category]) {
      acc[img.category] = [];
    }
    acc[img.category].push(img);
    return acc;
  }, {});

  // 选择/取消选择图片
  function toggleImageSelection(imageIndex: number) {
    if (selectedImages.has(imageIndex)) {
      selectedImages.delete(imageIndex);
    } else {
      selectedImages.add(imageIndex);
    }
    selectedImages = selectedImages; // 触发响应式更新
  }

  // 全选/取消全选
  function toggleSelectAll() {
    if (selectedImages.size === filteredImages.length) {
      selectedImages.clear();
    } else {
      filteredImages.forEach((img, index) => {
        selectedImages.add(img.index);
      });
    }
    selectedImages = selectedImages;
  }

  // 下载单个图片
  async function downloadImage(image: any) {
    try {
      const link = document.createElement('a');
      link.href = image.src;
      link.download = `${image.alt || 'image'}_${image.index}.jpg`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('下载失败:', error);
      // 复制到剪贴板作为备选方案
      navigator.clipboard.writeText(image.src).then(() => {
        alert('图片链接已复制到剪贴板');
      });
    }
  }

  // 批量下载选中的图片
  async function downloadSelectedImages() {
    const selectedImagesData = images.filter(img => selectedImages.has(img.index));

    if (selectedImagesData.length === 0) {
      alert('请先选择要下载的图片');
      return;
    }

    for (const image of selectedImagesData) {
      await downloadImage(image);
      // 添加延迟避免浏览器阻止多个下载
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // 复制所有图片链接
  function copyAllLinks() {
    const links = filteredImages.map(img => img.src).join('\n');
    navigator.clipboard.writeText(links).then(() => {
      alert(`已复制 ${filteredImages.length} 个图片链接到剪贴板`);
    });
  }
</script>

<!-- 遮罩层 -->
<button
  type="button"
  class="fixed inset-0 bg-black/50 backdrop-blur-sm z-panel-backdrop animate-fade-in cursor-default"
  on:click={onClose}
  on:keydown={(e) => e.key === 'Escape' && onClose()}
  aria-label="关闭图片面板"
></button>

<!-- 主面板 -->
<div class="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-panel-main animate-slide-in-right overflow-hidden flex flex-col">
  <!-- 头部 -->
  <div class="gradient-primary text-white p-4 flex items-center justify-between">
    <div class="flex items-center space-x-2">
      <Image class="w-5 h-5" />
      <h2 class="text-lg font-semibold">图片管理器</h2>
      <span class="bg-white/20 px-2 py-1 rounded-full text-xs">
        {filteredImages.length} 张
      </span>
    </div>
    <button
      on:click={onClose}
      class="hover:bg-white/20 p-1 rounded-lg transition-colors"
    >
      <X class="w-5 h-5" />
    </button>
  </div>

  <!-- 搜索和筛选栏 -->
  <div class="p-4 border-b border-gray-200 space-y-3">
    <!-- 搜索框 -->
    <div class="relative">
      <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
      <input
        type="text"
        bind:value={searchTerm}
        placeholder="搜索图片..."
        class="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      />
    </div>

    <!-- 分类筛选 -->
    <div class="flex items-center space-x-2 overflow-x-auto">
      {#each categories as category}
        <button
          on:click={() => selectedCategory = category}
          class="px-3 py-1 rounded-full text-sm whitespace-nowrap transition-colors
                 {selectedCategory === category
                   ? 'bg-primary-500 text-white'
                   : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
        >
          {category}
        </button>
      {/each}
    </div>
  </div>

  <!-- 操作栏 -->
  <div class="p-4 border-b border-gray-200 bg-gray-50">
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-2">
        <button
          on:click={toggleSelectAll}
          class="flex items-center space-x-1 text-sm text-gray-600 hover:text-primary-600 transition-colors"
        >
          {#if selectedImages.size === filteredImages.length && filteredImages.length > 0}
            <CheckSquare class="w-4 h-4" />
            <span>取消全选</span>
          {:else}
            <Square class="w-4 h-4" />
            <span>全选</span>
          {/if}
        </button>

        <span class="text-sm text-gray-500">
          已选 {selectedImages.size} 张
        </span>
      </div>

      <div class="flex items-center space-x-2">
        <!-- 视图切换 -->
        <div class="flex items-center bg-gray-200 rounded-lg p-1">
          <button
            on:click={() => viewMode = 'grid'}
            class="p-1 rounded {viewMode === 'grid' ? 'bg-white shadow-sm' : ''}"
          >
            <Grid class="w-4 h-4" />
          </button>
          <button
            on:click={() => viewMode = 'list'}
            class="p-1 rounded {viewMode === 'list' ? 'bg-white shadow-sm' : ''}"
          >
            <List class="w-4 h-4" />
          </button>
        </div>

        <!-- 批量操作 -->
        {#if selectedImages.size > 0}
          <button
            on:click={downloadSelectedImages}
            class="flex items-center space-x-1 bg-green-500 text-white px-3 py-1 rounded-lg text-sm hover:bg-green-600 transition-colors"
          >
            <Download class="w-4 h-4" />
            <span>下载选中</span>
          </button>
        {/if}
      </div>
    </div>
  </div>

  <!-- 图片列表 -->
  <div class="flex-1 overflow-y-auto p-4">
    {#if Object.keys(groupedImages).length === 0}
      <div class="text-center py-8 text-gray-500">
        <ImageIcon class="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>暂无图片</p>
      </div>
    {:else}
      {#each Object.entries(groupedImages) as [category, categoryImages]}
        <div class="mb-6">
          <h3 class="text-sm font-semibold text-gray-700 mb-3 flex items-center justify-between">
            <span>{category}</span>
            <span class="text-xs text-gray-500">({categoryImages.length}张)</span>
          </h3>

          <div class="space-y-2 {viewMode === 'grid' ? 'grid grid-cols-2 gap-2' : ''}">
            {#each categoryImages as image}
              <div
                class="group relative bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-all duration-200
                       {viewMode === 'list' ? 'flex items-center space-x-3' : ''}"
              >
                <!-- 选择框 -->
                <button
                  on:click|stopPropagation={() => toggleImageSelection(image.index)}
                  class="absolute top-2 left-2 z-10 bg-white/90 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {#if selectedImages.has(image.index)}
                    <CheckSquare class="w-4 h-4 text-primary-500" />
                  {:else}
                    <Square class="w-4 h-4 text-gray-400" />
                  {/if}
                </button>

                <!-- 图片预览 -->
                <div class="{viewMode === 'list' ? 'w-16 h-16 flex-shrink-0' : 'aspect-square'} bg-gray-100">
                  <img
                    src={image.src}
                    alt={image.alt}
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>

                <!-- 图片信息 -->
                <div class="p-3 flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 truncate">
                    {image.alt}
                  </p>
                  <p class="text-xs text-gray-500 mt-1">
                    {image.width} × {image.height}
                  </p>

                  {#if viewMode === 'list'}
                    <div class="mt-2 flex items-center space-x-2">
                      <button
                        on:click={() => downloadImage(image)}
                        class="text-xs bg-primary-500 text-white px-2 py-1 rounded hover:bg-primary-600 transition-colors"
                      >
                        下载
                      </button>
                    </div>
                  {/if}
                </div>

                <!-- 悬停操作 -->
                {#if viewMode === 'grid'}
                  <div class="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      on:click={() => downloadImage(image)}
                      class="bg-primary-500 text-white p-1.5 rounded-lg hover:bg-primary-600 transition-colors"
                    >
                      <Download class="w-4 h-4" />
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- 底部操作栏 -->
  <div class="p-4 border-t border-gray-200 bg-gray-50">
    <div class="flex items-center justify-between">
      <button
        on:click={copyAllLinks}
        class="text-sm text-gray-600 hover:text-primary-600 transition-colors"
      >
        复制所有链接
      </button>

      <span class="text-xs text-gray-500">
        共 {images.length} 张图片
      </span>
    </div>
  </div>
</div>