<script lang="ts">
  import { Image, Download, Eye, CheckCircle, Filter } from 'lucide-svelte';

  // 组件属性
  export let totalImages: number = 0;
  export let selectedImages: number = 0;
  export let downloadedImages: number = 0;
  export let categories: string[] = [];
  export let isLoading: boolean = false;

  // 计算属性
  $: selectionRate = totalImages > 0 ? Math.round((selectedImages / totalImages) * 100) : 0;
  $: downloadRate = selectedImages > 0 ? Math.round((downloadedImages / selectedImages) * 100) : 0;

  // 格式化数字
  function formatNumber(num: number): string {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  }
</script>

<div class="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl p-4 shadow-lg">
  <!-- 标题 -->
  <div class="flex items-center space-x-2 mb-4">
    <Filter class="w-5 h-5" />
    <h3 class="font-semibold text-lg">图片统计</h3>
    {#if isLoading}
      <div class="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full ml-2"></div>
    {/if}
  </div>

  <!-- 主要统计 -->
  <div class="grid grid-cols-2 gap-4 mb-4">
    <!-- 总图片数 -->
    <div class="bg-white/10 rounded-lg p-3">
      <div class="flex items-center space-x-2 mb-1">
        <Image class="w-4 h-4" />
        <span class="text-sm opacity-90">总图片</span>
      </div>
      <div class="text-2xl font-bold">{formatNumber(totalImages)}</div>
    </div>

    <!-- 已选择 -->
    <div class="bg-white/10 rounded-lg p-3">
      <div class="flex items-center space-x-2 mb-1">
        <CheckCircle class="w-4 h-4" />
        <span class="text-sm opacity-90">已选择</span>
      </div>
      <div class="text-2xl font-bold">{formatNumber(selectedImages)}</div>
      {#if totalImages > 0}
        <div class="text-xs opacity-75 mt-1">{selectionRate}%</div>
      {/if}
    </div>

    <!-- 已下载 -->
    <div class="bg-white/10 rounded-lg p-3">
      <div class="flex items-center space-x-2 mb-1">
        <Download class="w-4 h-4" />
        <span class="text-sm opacity-90">已下载</span>
      </div>
      <div class="text-2xl font-bold">{formatNumber(downloadedImages)}</div>
      {#if selectedImages > 0}
        <div class="text-xs opacity-75 mt-1">{downloadRate}%</div>
      {/if}
    </div>

    <!-- 查看进度 -->
    <div class="bg-white/10 rounded-lg p-3">
      <div class="flex items-center space-x-2 mb-1">
        <Eye class="w-4 h-4" />
        <span class="text-sm opacity-90">进度</span>
      </div>
      <div class="text-2xl font-bold">
        {totalImages > 0 ? Math.round((downloadedImages / totalImages) * 100) : 0}%
      </div>
    </div>
  </div>

  <!-- 分类统计 -->
  {#if categories.length > 0}
    <div class="border-t border-white/20 pt-3">
      <h4 class="text-sm font-medium mb-2 opacity-90">图片分类</h4>
      <div class="flex flex-wrap gap-1">
        {#each categories as category}
          <span class="bg-white/20 px-2 py-1 rounded-full text-xs">
            {category}
          </span>
        {/each}
      </div>
    </div>
  {/if}

  <!-- 空状态提示 -->
  {#if totalImages === 0 && !isLoading}
    <div class="text-center py-2 opacity-75">
      <Image class="w-8 h-8 mx-auto mb-2" />
      <p class="text-sm">暂无图片数据</p>
      <p class="text-xs opacity-75">点击图片抓取按钮开始</p>
    </div>
  {/if}
</div>
