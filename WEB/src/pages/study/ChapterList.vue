<!--
============================================================================
文件名：ChapterList.vue（章节列表组件）
所属目录：src/pages/study/
文件作用：章节列表（状态图标/内联提示/生成进度）+ 底部「生成下一章」按钮，
         从学习页 index.vue 原样抽取，
         供桌面左侧栏、移动端底部面板、移动端全屏右侧面板三处复用
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配
============================================================================
-->

<template>
  <div class="flex-1 flex flex-col min-h-0">
    <!-- 章节列表（navId 用于桌面端折叠时定位） -->
    <nav :id="navId || undefined" class="flex-1 overflow-y-auto no-scrollbar py-1">
      <!-- 加载中占位 -->
      <div v-if="courseLoading" class="px-3 py-4 text-center">
        <span class="text-[10px] text-[var(--color-text-secondary)]">章节加载中...</span>
      </div>
      <!-- 章节列表项 -->
      <div v-for="ch in chapters" :key="ch.id"
           class="group flex flex-col"
           :class="[String(ch.id) === String(activeChapter) ? 'border-l-blue-500 dark:border-l-blue-400 bg-[var(--color-card-hover)]' : 'border-l-transparent']">
        <!-- 章节行：点击切换（文件补全进行中时禁止切换） -->
        <div class="flex items-center gap-2 px-3 py-2 mx-1 transition-all duration-500 border-l-[3px]"
             :class="[
               String(ch.id) === String(activeChapter) ? 'border-l-blue-500 dark:border-l-blue-400 bg-[var(--color-card-hover)]' : 'border-l-transparent',
               isFixingMissing ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-[var(--color-card-hover)]'
             ]"
             @click="!isFixingMissing && ((ch.status === 'completed' || ch.status === 'partial_completed') ? $emit('select', ch) : showGeneratingTip(ch))">
          <!-- 状态图标 -->
          <span v-if="ch.status === 'completed'"
                class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-500 text-white text-[10px] font-bold flex-shrink-0">
            &#10003;
          </span>
          <span v-else-if="ch.status === 'partial_completed'"
                class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex-shrink-0"
                title="部分文件缺失，正在后台补全">
            &#9888;
          </span>
          <span v-else-if="ch.status === 'generating'"
                class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex-shrink-0 animate-pulse">
            &#9881;
          </span>
          <span v-else-if="ch.status === 'failed'"
                class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex-shrink-0">
            &#10007;
          </span>
          <span v-else
                class="inline-flex items-center justify-center w-4 h-4 rounded-full border border-[var(--color-border)] flex-shrink-0"></span>
          <!-- 编号 -->
          <span class="text-[11px] font-mono flex-shrink-0 w-5"
                :class="[String(ch.id) === String(activeChapter) ? 'text-blue-500 dark:text-blue-400 font-semibold' : 'text-[var(--color-text-secondary)]']">
            {{ String(ch.sequence).padStart(2, '0') }}
          </span>
          <!-- 标题 -->
          <span class="text-xs flex-1 truncate"
                :class="[String(ch.id) === String(activeChapter) ? 'text-black dark:text-white font-medium' : (ch.status === 'completed' ? 'text-black dark:text-white' : 'text-[var(--color-text-secondary)]')]">
            {{ ch.title }}
          </span>
          <!-- 时长 -->
          <span class="text-[10px] font-mono flex-shrink-0"
                :class="[String(ch.id) === String(activeChapter) ? 'text-blue-500 dark:text-blue-400' : 'text-[var(--color-text-secondary)]']">
            {{ ch.duration }}
          </span>
        </div>
        <!-- 文件修复中的提示（当前章节正在补全缺失文件） -->
        <div v-if="String(ch.id) === String(activeChapter) && isFixingMissing"
             class="px-3 py-1.5 mx-1 mb-1 rounded-[6px] bg-amber-50/60 dark:bg-amber-900/10 border border-amber-200/40 dark:border-amber-800/30 transition-colors duration-500">
          <div class="flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5 text-amber-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            <span class="text-[10px] text-amber-600 dark:text-amber-400">{{ fixingBannerText }}</span>
          </div>
        </div>
        <!-- 生成中的进度条 -->
        <div v-if="ch.status === 'generating' && chapterProgressMap[ch.id]"
             class="px-3 py-1.5 mx-1 mb-1 rounded-[6px] bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200/40 dark:border-blue-800/30 transition-colors duration-500">
          <!-- 阶段文字 -->
          <p class="text-[10px] text-gray-600 dark:text-gray-300 mb-1 transition-colors duration-500">
            {{ getChapterProgressLabel(ch) }}
          </p>
          <!-- 进度条 -->
          <div class="h-1 rounded-full bg-white/70 dark:bg-gray-700/50 overflow-hidden transition-colors duration-500">
            <div class="h-full rounded-full bg-blue-500 dark:bg-blue-400 transition-[width] duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                 :style="{ width: getChapterProgressBarWidth(ch) }" />
          </div>
          <!-- 百分比 -->
          <p class="text-[9px] text-gray-500 dark:text-gray-400 mt-0.5 text-right transition-colors duration-500">
            {{ getChapterProgressCountText(ch) }}
          </p>
        </div>
        <!-- 待生成的提示（pending/failed 状态，生成中的进度条已有独立展示故不重复） -->
        <div v-if="ch.status === 'pending' || ch.status === 'failed'"
             class="px-3 py-1.5 mx-1 mb-1 rounded-[6px] bg-amber-50/60 dark:bg-amber-900/10 border border-amber-200/40 dark:border-amber-800/30 transition-colors duration-500">
          <!-- 提示图标 + 文字 -->
          <div class="flex items-center gap-1.5">
            <span v-if="ch.status === 'pending'"
                  class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-amber-400 dark:border-amber-500 flex-shrink-0">
              <svg class="w-2 h-2 text-amber-500 dark:text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                <rect x="11" y="4" width="2" height="13" rx="1"/><rect x="11" y="19" width="2" height="2" rx="1"/>
              </svg>
            </span>
            <span v-else
                  class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] font-bold flex-shrink-0">
              &#10007;
            </span>
            <p class="text-[10px] text-amber-700 dark:text-amber-300 transition-colors duration-500 leading-tight">
              {{ ch.status === 'pending' ? '该章节尚未生成，请点击下方"生成下一章"按钮' : '该章节生成失败，请点击"生成下一章"重新生成' }}
            </p>
          </div>
        </div>
      </div>
    </nav>

    <!-- 底部状态 -->
    <div class="px-3 py-2 border-t border-[var(--color-border)] space-y-2">
      <!-- 状态指示 -->
      <div class="flex items-center gap-1.5 text-[10px] text-[var(--color-text-secondary)]">
        <span v-if="chapterLoading"
              class="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
        <span v-else-if="totalPages > 0"
              class="inline-block w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400"></span>
        <span>{{ chapterLoading ? '内容加载中...' : (totalPages > 0 ? ('共 ' + totalPages + ' 页幻灯片') : '暂无内容') }}</span>
      </div>
      <!-- 生成下一章按钮（始终显示，仅控制可点击状态和提示文本） -->
      <el-button
        size="small"
        type="primary"
        :disabled="generateBtnDisabled"
        :loading="isGeneratingChapter"
        @click="$emit('generate-next')"
        class="w-full !rounded-[10px] !text-xs"
      >
        {{ generateBtnText }}
      </el-button>
    </div>
  </div>
</template>

<script setup>
// ==================== Props / Emits ====================
// 纯展示组件：数据与操作全部由父组件（学习页 script.js）通过 props/emits 传入
defineProps({
  /** 章节列表 */
  chapters: { type: Array, default: () => [] },
  /** 当前活跃章节 ID */
  activeChapter: { type: [String, Number], default: null },
  /** 章节内容加载状态 */
  chapterLoading: { type: Boolean, default: false },
  /** 课程加载状态 */
  courseLoading: { type: Boolean, default: true },
  /** 当前章节总页数（底部状态指示） */
  totalPages: { type: Number, default: 0 },
  /** 章节生成进度 Map（chapterId → 进度数据） */
  chapterProgressMap: { type: Object, default: () => ({}) },
  /** 生成下一章按钮是否禁用 */
  generateBtnDisabled: { type: Boolean, default: false },
  /** 生成下一章按钮文案 */
  generateBtnText: { type: String, default: "生成下一章" },
  /** 是否正在调用生成 API */
  isGeneratingChapter: { type: Boolean, default: false },
  /** 文件补全中（禁止切换章节） */
  isFixingMissing: { type: Boolean, default: false },
  /** 文件补全横幅文案 */
  fixingBannerText: { type: String, default: "" },
  /** 进度阶段文字函数（由父组件传入，闭包共享 chapterProgressMap） */
  getChapterProgressLabel: { type: Function, required: true },
  /** 进度条宽度函数 */
  getChapterProgressBarWidth: { type: Function, required: true },
  /** 进度计数文字函数 */
  getChapterProgressCountText: { type: Function, required: true },
  /** 列表容器 id（仅桌面端传 "sidebar-nav"，供折叠逻辑定位） */
  navId: { type: String, default: "" },
});

defineEmits(["select", "generate-next"]);

/** 非已完成章节点击处理（提示已内联在模板中，保留空函数兼容点击绑定） */
function showGeneratingTip() {
  // pending/failed 提示已内联显示，generating 进度条也已在模板中渲染，无需额外操作
}
</script>
