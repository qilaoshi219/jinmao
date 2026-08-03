<!--
============================================================================
文件名：index.vue（课程学习页入口组件）
所属目录：src/pages/study/
文件作用：课程学习页的 Vue SFC 入口组件
         NERV 蓝色战术风格 — 三栏可拖动布局
         Template 定义页面 HTML 结构（纯视图层）
         Script 通过 <script src="./script.js"> 引用业务逻辑

设计规范遵循：规则1-9，Element Plus 优先
============================================================================
-->

<template>
  <!--
  ============================================================
  页面整体：全屏 flex 列布局
    - 顶栏 h-10
    - 三栏主体 fill 剩余高度
  ============================================================
  -->
  <div class="flex flex-col h-screen overflow-hidden bg-[var(--color-bg-primary)] transition-colors duration-500">

    <!-- ===== 顶栏 h-10 ===== -->
    <header class="flex items-center justify-between h-10 px-3 border-b flex-shrink-0 bg-[var(--color-bg-secondary)] border-[var(--color-border)] transition-colors duration-500">
      <!-- 左侧：返回按钮 -->
      <button @click="goBack"
              class="flex items-center gap-1 text-xs font-medium text-blue-500 dark:text-blue-400 hover:opacity-80 transition-opacity duration-500 bg-transparent border-none cursor-pointer">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        <span>返回</span>
      </button>
      <!-- 中间：课程标题 -->
      <span class="text-xs text-[var(--color-text-secondary)] truncate max-w-[50%]">{{ courseInfo.name || '加载中...' }}</span>
      <!-- 右侧：主题切换 -->
      <button @click="toggleTheme"
              class="flex items-center justify-center w-6 h-6 rounded-[10px] border border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)] hover:text-blue-500 hover:border-blue-500 dark:hover:text-blue-400 dark:hover:border-blue-400 transition-all duration-500 cursor-pointer"
              title="切换主题">
        <svg v-show="isDark" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="5" stroke-width="2"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <svg v-show="!isDark" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </header>

    <!-- 文件补全横幅 -->
    <div v-if="isFixingMissing"
         class="flex items-center justify-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 transition-all duration-500">
      <svg class="w-4 h-4 text-amber-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
      </svg>
      <span class="text-xs text-amber-600 dark:text-amber-400">{{ fixingBannerText }}</span>
    </div>

    <!-- ===== 三栏主体 ===== -->
    <div class="flex flex-1 min-h-0 overflow-hidden">

      <!-- === 左侧边栏：课程目录 === -->
      <aside id="left-sidebar"
             class="hidden md:flex flex-col flex-shrink-0 bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)] transition-colors duration-500"
             style="width:224px;">
        <!-- 标题 -->
        <div class="flex items-center justify-between px-3 py-2.5 border-b border-[var(--color-border)]">
          <div class="flex items-center gap-1.5">
            <span class="text-blue-500 dark:text-blue-400 font-mono text-xs select-none">◤</span>
            <span class="text-xs font-semibold text-black dark:text-white">课程目录</span>
            <span class="text-blue-500 dark:text-blue-400 font-mono text-xs select-none">◢</span>
          </div>
          <button @click="toggleSidebar"
                  class="flex items-center justify-center w-5 h-5 rounded-[10px] border border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)] hover:text-blue-500 dark:hover:text-blue-400 hover:border-blue-500 dark:hover:border-blue-400 transition-all duration-500 cursor-pointer"
                  title="折叠目录">
            <svg v-show="sidebarExpanded" class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
            </svg>
            <svg v-show="!sidebarExpanded" class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/>
            </svg>
          </button>
        </div>
        <!-- 章节列表 -->
        <nav id="sidebar-nav" class="flex-1 overflow-y-auto no-scrollbar py-1">
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
                 @click="!isFixingMissing && ((ch.status === 'completed' || ch.status === 'partial_completed') ? switchChapter(ch.id) : showGeneratingTip(ch))">
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
            @click="handleGenerateNextChapter"
            class="w-full !rounded-[10px] !text-xs"
          >
            {{ generateBtnText }}
          </el-button>
          <!-- 自动生成开关 -->
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-[var(--color-text-secondary)]">自动生成</span>
            <el-switch
              v-model="autoGenerateEnabled"
              size="small"
              @change="onAutoGenerateToggle"
            />
          </div>
        </div>
      </aside>

      <!-- === 左拖动手柄 === -->
      <div id="resize-handle-left"
           class="hidden md:block flex-shrink-0 w-[6px] cursor-col-resize relative z-20 transition-colors duration-500 hover:bg-blue-500 dark:hover:bg-blue-400"
           style="background:var(--color-border);"
           @mousedown="startResize('left', $event)">
        <div class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-blue-500 dark:bg-blue-400 opacity-0 group-hover:opacity-100"></div>
      </div>

      <!-- === 中间播放区 === -->
      <section class="flex-1 flex flex-col min-w-0 bg-[var(--color-bg-primary)] transition-colors duration-500">
        <div id="ppt-area" class="flex-1 relative flex flex-col items-center justify-center min-h-0 bg-[var(--color-card)]">

          <!-- 战术网格 -->
          <div class="absolute inset-0 pointer-events-none" style="background-image:linear-gradient(var(--color-rail) 1px,transparent 1px),linear-gradient(90deg,var(--color-rail) 1px,transparent 1px);background-size:20px 20px;opacity:0.03;"></div>
          <!-- 角括号 -->
          <span class="absolute top-3 left-3 text-blue-500 dark:text-blue-400 font-mono text-xs select-none z-10">&#9697;</span>
          <span class="absolute top-3 right-3 text-blue-500 dark:text-blue-400 font-mono text-xs select-none z-10">&#9698;</span>
          <span class="absolute bottom-3 left-3 text-blue-500 dark:text-blue-400 font-mono text-xs select-none z-10">&#9699;</span>
          <span class="absolute bottom-3 right-3 text-blue-500 dark:text-blue-400 font-mono text-xs select-none z-10">&#9700;</span>

          <!-- 页码指示器 -->
          <div class="absolute top-3 right-10 z-20 font-mono text-xs tracking-wider px-2 py-0.5 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-card)] text-blue-500 dark:text-blue-400">
            {{ currentPage }} / {{ totalPages }}
          </div>

          <!-- PPT 16:9 容器（overflow-hidden 配合 iframe 缩放） -->
          <div id="ppt-container" ref="pptContainer"
               class="relative w-full aspect-[16/9] border border-[var(--color-border)] z-10 transition-all duration-500 bg-[var(--color-card-hover)] overflow-hidden"
               @mouseenter="showControls"
               @mouseleave="hideControls">

            <!-- 内边框 -->
            <div class="absolute inset-1 border border-[var(--color-border)] pointer-events-none z-20"></div>

            <!-- PPT 加载中指示器 -->
            <div v-if="pptLoading" class="absolute inset-0 flex flex-col items-center justify-center z-10">
              <svg class="w-8 h-8 text-blue-500 dark:text-blue-400 mb-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              <span class="text-xs text-[var(--color-text-secondary)]">幻灯片加载中...</span>
              <span class="text-[10px] text-[var(--color-text-secondary)] mt-1 opacity-60">{{ currentChapterTitle }}</span>
            </div>

            <!-- 无内容占位（当 slides 为空且不加载中时） -->
            <div v-if="!pptLoading && !currentPptUrl" class="absolute inset-0 flex flex-col items-center justify-center z-10">
              <svg class="w-12 h-12 text-[var(--color-text-secondary)] mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"/>
              </svg>
              <span class="text-sm text-[var(--color-text-secondary)] font-mono tracking-wider">请选择一个已完成的章节</span>
              <span class="text-[10px] text-[var(--color-text-secondary)] mt-1 opacity-60">{{ courseInfo.name }}</span>
            </div>

            <!-- PPT iframe：固定 1920×1080 渲染，通过 transform scale 缩放适配容器 -->
            <!-- 使用 translate(-50%,-50%) + scale 实现居中等比缩放，无论容器比例如何变化都不会错位 -->
            <!-- pointer-events-none + tabindex=-1 + scrolling=no：iframe 为纯展示，不与用户交互（不可点击/选中/滚动） -->
            <iframe v-show="!pptLoading && currentPptUrl"
              :key="currentPptUrl"
              :src="currentPptUrl"
              class="absolute border-none z-10 pointer-events-none select-none"
              tabindex="-1"
              scrolling="no"
              sandbox="allow-scripts allow-same-origin"
              :style="{
                width: pptBaseWidth + 'px',
                height: pptBaseHeight + 'px',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%) scale(' + pptScale + ')'
              }"
              @load="onPptLoad"
              @error="pptLoading = false"
            ></iframe>

            <!-- 全屏按钮 -->
            <button @click.stop="toggleFullscreen"
                    class="absolute top-2 right-2 z-30 flex items-center justify-center w-7 h-7 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text-secondary)] hover:text-blue-500 hover:border-blue-500 dark:hover:text-blue-400 dark:hover:border-blue-400 transition-all duration-500 cursor-pointer opacity-0 pointer-events-none ppt-hover-show"
                    title="全屏">
              <svg v-show="!isFullscreen" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
              </svg>
              <svg v-show="isFullscreen" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/>
              </svg>
            </button>

            <!-- 字幕层 -->
            <div class="absolute left-0 right-0 z-20 text-center px-6" style="bottom:4.5rem;">
              <p class="text-base md:text-lg font-bold leading-relaxed select-none pointer-events-none"
                 style="color:#000;text-shadow:-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff,0 0 8px rgba(0,0,0,0.15);">
                {{ subtitleText }}
              </p>
            </div>

            <!-- 播放控件 (B站风格，hover 显示) -->
            <div ref="playerControls"
                 class="absolute bottom-0 left-0 right-0 z-30 transition-opacity duration-[400ms]"
                 style="opacity:0;pointer-events:none;"
                 @mouseenter="cancelHideTimer"
                 @mouseleave="hideControls">
              <!-- 渐变遮罩 -->
              <div class="h-20 pointer-events-none" style="background:linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%);"></div>
              <!-- 控件 -->
              <div class="absolute bottom-0 left-0 right-0">
                <!-- 进度条 -->
                <div class="relative h-1 bg-white/20 cursor-pointer mx-3 group"
                     @click="seekProgress">
                  <div class="absolute inset-y-0 left-0 bg-blue-500 dark:bg-blue-400 transition-all duration-300 rounded-r-sm"
                       :style="{ width: progressPercent + '%' }"></div>
                  <div class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-blue-500 dark:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                       :style="{ left: progressPercent + '%' }"></div>
                </div>
                <!-- 按钮行 -->
                <div class="flex items-center justify-between px-3 h-11">
                  <div class="flex items-center gap-0.5">
                    <button @click="prevPage" class="flex items-center justify-center w-8 h-8 rounded-[10px] bg-transparent text-white/85 hover:text-white transition-all cursor-pointer" title="上一页">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"/></svg>
                    </button>
                    <button @click="togglePlay" class="flex items-center justify-center w-9 h-9 rounded-[10px] text-white hover:text-blue-400 transition-all cursor-pointer" title="暂停">
                      <svg v-show="isPlaying" class="w-5 h-5 fill-current" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                      <svg v-show="!isPlaying" class="w-5 h-5 fill-current" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>
                    </button>
                    <button @click="nextPage" class="flex items-center justify-center w-8 h-8 rounded-[10px] bg-transparent text-white/85 hover:text-white transition-all cursor-pointer" title="下一页">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.934 12.8a1 1 0 010-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zm8 0a1 1 0 010-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.334-4z"/></svg>
                    </button>
                  </div>
                  <span class="font-mono text-xs text-white/75 tracking-wider">{{ formattedTime }} / {{ formattedTotalTime }}</span>
                  <div class="flex items-center gap-2">
                    <button @click="toggleAutoPlay" class="flex items-center gap-1 px-2 h-7 rounded-[10px] text-[11px] transition-all cursor-pointer bg-transparent text-white/75 hover:text-white" title="自动播放">
                      <span>自动</span>
                      <span class="inline-block w-1.5 h-1.5 rounded-full" :class="autoPlay ? 'bg-green-500' : 'bg-white/40'"></span>
                    </button>
                    <el-select v-model="playbackSpeed" size="small" class="speed-select" placeholder="1.0x">
                      <el-option label="0.75x" value="0.75"/>
                      <el-option label="1.0x" value="1.0"/>
                      <el-option label="1.25x" value="1.25"/>
                      <el-option label="1.5x" value="1.5"/>
                      <el-option label="2.0x" value="2.0"/>
                    </el-select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 隐藏的音频播放器（每页幻灯片对应一个音频文件） -->
        <audio ref="audioRef"
          :src="currentAudioUrl"
          preload="auto"
          style="display:none;"
          @timeupdate="onAudioTimeUpdate"
          @ended="onAudioEnded"
          @loadedmetadata="onAudioLoaded"
          @error="onAudioError"
        ></audio>
      </section>

      <!-- === 右拖动手柄 === -->
      <div id="resize-handle-right"
           class="hidden lg:block flex-shrink-0 w-[6px] cursor-col-resize relative z-20 transition-colors duration-500 hover:bg-blue-500 dark:hover:bg-blue-400"
           style="background:var(--color-border);"
           @mousedown="startResize('right', $event)">
        <div class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-blue-500 dark:bg-blue-400 opacity-0 group-hover:opacity-100"></div>
      </div>

      <!-- === 右侧边栏：AI助教 + 口播稿 === -->
      <aside id="right-sidebar"
             class="hidden lg:flex flex-col flex-shrink-0 bg-[var(--color-bg-secondary)] border-l border-[var(--color-border)] transition-colors duration-500"
             style="width:320px;">
        <!-- Tab 切换 -->
        <div class="flex border-b border-[var(--color-border)]">
          <button @click="activeTab = 'ai'"
                  class="flex-1 py-2.5 text-xs font-medium transition-all duration-500 border-b-2 bg-transparent cursor-pointer"
                  :class="activeTab === 'ai' ? 'text-blue-500 dark:text-blue-400 border-b-blue-500 dark:border-b-blue-400' : 'text-[var(--color-text-secondary)] border-b-transparent'">
            AI 助教
          </button>
          <button @click="activeTab = 'script'"
                  class="flex-1 py-2.5 text-xs font-medium transition-all duration-500 border-b-2 bg-transparent cursor-pointer"
                  :class="activeTab === 'script' ? 'text-blue-500 dark:text-blue-400 border-b-blue-500 dark:border-b-blue-400' : 'text-[var(--color-text-secondary)] border-b-transparent'">
            口播稿
          </button>
        </div>

        <!-- AI 助教面板 -->
        <div v-show="activeTab === 'ai'" class="flex-1 flex flex-col min-h-0 overflow-hidden">
          <!-- 面板头部：章节名 + 历史/新对话操作 -->
          <div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--color-border)] flex-shrink-0">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-[11px] font-semibold text-black dark:text-white truncate">{{ currentChapterTitle || 'AI 助教' }}</span>
              <span v-if="activeConversationId" class="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 dark:text-blue-400 text-[9px] leading-none">对话中</span>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
              <!-- 历史对话 -->
              <el-popover v-model:visible="aiHistoryVisible" placement="bottom-end" :width="280" trigger="click">
                <template #reference>
                  <button class="flex items-center justify-center w-6 h-6 rounded-[10px] border border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)] hover:text-blue-500 hover:border-blue-500 dark:hover:text-blue-400 dark:hover:border-blue-400 transition-all duration-500 cursor-pointer"
                          title="历史对话">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </button>
                </template>
                <div class="max-h-[300px] overflow-y-auto">
                  <div v-if="aiHistory.length === 0" class="py-6 text-center text-xs text-[var(--color-text-secondary)]">
                    暂无历史对话
                  </div>
                  <div v-for="c in aiHistory" :key="c.id"
                       class="px-2 py-2 rounded-[8px] cursor-pointer hover:bg-[var(--color-card-hover)] transition-colors duration-300"
                       :class="String(c.id) === String(activeConversationId) ? 'bg-[var(--color-card-hover)]' : ''"
                       @click="openAiConversation(c.id)">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-xs text-black dark:text-white truncate">{{ c.title || '未命名对话' }}</span>
                      <span class="flex-shrink-0 text-[9px] px-1 py-0.5 rounded bg-[var(--color-card-hover)] text-[var(--color-text-secondary)]">{{ c.model === 'pro' ? 'pro' : 'flash' }}</span>
                    </div>
                    <div class="text-[10px] text-[var(--color-text-secondary)] mt-0.5">{{ c.chapterName }} · {{ c.messageCount }} 条消息</div>
                  </div>
                </div>
              </el-popover>
              <!-- 新对话 -->
              <button @click="startNewAiConversation"
                      class="flex items-center justify-center w-6 h-6 rounded-[10px] border border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)] hover:text-blue-500 hover:border-blue-500 dark:hover:text-blue-400 dark:hover:border-blue-400 transition-all duration-500 cursor-pointer"
                      title="新对话">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- 消息区 -->
          <div ref="aiMessagesRef" class="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar">
            <!-- 空状态引导 -->
            <div v-if="aiMessages.length === 0" class="flex flex-col items-center justify-center pt-12 px-4 text-center">
              <svg class="w-10 h-10 mb-3 text-[var(--color-text-secondary)] opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
              </svg>
              <p class="text-xs text-[var(--color-text-secondary)]">发送第一条消息开始提问</p>
              <p class="text-[10px] text-[var(--color-text-secondary)] mt-1 opacity-60">将自动带入本章内容与当前页口播稿、助教提示</p>
            </div>

            <template v-for="(msg, i) in aiMessages" :key="i">
              <!-- 思考过程（可折叠，思考中带动效） -->
              <div v-if="msg.role === 'assistant' && !msg.greeting && (msg.thinking || (msg.streaming && msg.thinkingMode && !msg.text))"
                   class="flex justify-start pl-1">
                <div class="max-w-[88%] rounded-[10px] border border-[var(--color-border)] overflow-hidden text-xs">
                  <button @click="msg.thinkingOpen = !msg.thinkingOpen"
                          class="w-full flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer bg-transparent border-none text-[var(--color-text-secondary)] hover:text-blue-500 dark:hover:text-blue-400 transition-colors duration-300">
                    <svg class="w-2.5 h-2.5 transition-transform duration-300 flex-shrink-0" :class="msg.thinkingOpen ? 'rotate-90' : ''"
                         fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
                    </svg>
                    <svg v-if="msg.streaming && !msg.text" class="w-2.5 h-2.5 animate-spin flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3a9 9 0 109 9h-2.4A6.6 6.6 0 1112 5.4V3z"/>
                    </svg>
                    <span class="text-[10px]">
                      <span v-if="msg.streaming && !msg.text" class="animate-pulse">思考中...</span>
                      <span v-else>思考过程</span>
                    </span>
                  </button>
                  <div v-if="msg.thinkingOpen && msg.thinking"
                       class="px-2.5 py-2 text-[11px] leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap break-words border-t border-[var(--color-border)] max-h-40 overflow-y-auto">
                    {{ msg.thinking }}
                  </div>
                </div>
              </div>

              <!-- 消息气泡 -->
              <div :class="['flex', msg.role === 'user' ? 'justify-end' : 'justify-start']">
                <div class="max-w-[88%] px-3 py-2 rounded-[10px] text-xs leading-relaxed break-words"
                     :class="msg.role === 'user'
                       ? 'bg-blue-500 text-white'
                       : msg.failed
                         ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                         : msg.greeting
                           ? 'bg-blue-500/5 dark:bg-blue-400/10 border border-blue-500/20 dark:border-blue-400/20'
                           : 'bg-[var(--color-card-hover)] text-black dark:text-white'">
                  <!-- 助教提示：以"发送给用户"的问候消息呈现 -->
                  <template v-if="msg.greeting">
                    <div class="flex items-center gap-1 mb-1">
                      <svg class="w-3 h-3 text-blue-500 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>
                      </svg>
                      <span class="text-[10px] font-medium text-blue-500 dark:text-blue-400">助教提示</span>
                    </div>
                    <div class="whitespace-pre-wrap text-black dark:text-white">{{ msg.text }}</div>
                  </template>
                  <!-- 普通助手消息：Markdown 渲染 -->
                  <template v-else-if="msg.role === 'assistant'">
                    <div class="ai-msg-md" v-html="renderMarkdown(msg.text)"></div>
                    <span v-if="msg.streaming" class="inline-block ml-0.5 animate-pulse">▍</span>
                  </template>
                  <!-- 用户消息：纯文本 -->
                  <div v-else class="whitespace-pre-wrap">
                    {{ msg.text }}
                  </div>
                </div>
              </div>
              <!-- 推荐追问 -->
              <div v-if="msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && !msg.streaming"
                   class="flex justify-start flex-wrap gap-1.5 pl-1">
                <button v-for="(s, si) in msg.suggestions" :key="si"
                        @click="useSuggestion(s)"
                        class="px-2.5 py-1 rounded-full border border-blue-500/40 dark:border-blue-400/40 text-[10px] text-blue-500 dark:text-blue-400 hover:bg-blue-500/10 transition-all duration-300 cursor-pointer bg-transparent">
                  {{ s }}
                </button>
              </div>
            </template>
          </div>

          <!-- 底部输入组件（紧凑：两行输入 + 圆环进度 + 微型模型切换） -->
          <div class="flex-shrink-0 border-t border-[var(--color-border)] ai-composer">
            <div class="px-3 pt-2 pb-2.5">
              <!-- 两行输入框（Enter 发送，Shift+Enter 换行） -->
              <div class="bg-[var(--color-card-hover)] rounded-[10px] px-2.5 py-2">
                <el-input v-model="aiInput" type="textarea" resize="none"
                          :autosize="{ minRows: 2, maxRows: 5 }"
                          :disabled="aiStreaming"
                          placeholder="输入问题...（Enter 发送，Shift+Enter 换行）"
                          @keydown.enter.exact.prevent="sendAiMessage"/>
              </div>

              <!-- 工具行：微型模型切换 + 发送按钮 -->
              <div class="flex items-center justify-between mt-1.5">
                <div class="flex items-center gap-2">
                  <!-- 上下文用量：模型切换左侧的小圆环，hover 展开详情 -->
                  <el-popover trigger="hover" placement="top" :width="320">
                    <template #reference>
                      <button class="w-4 h-4 flex items-center justify-center p-0 bg-transparent border-none cursor-pointer group"
                              title="上下文使用情况">
                        <svg viewBox="0 0 36 36" class="w-4 h-4 -rotate-90 transition-transform duration-500 group-hover:scale-110">
                          <circle cx="18" cy="18" r="15.5" fill="none" class="ai-ring-bg" stroke-width="4"/>
                          <circle cx="18" cy="18" r="15.5" fill="none"
                                  :stroke="aiUsagePercent >= 90 ? '#ef4444' : '#409EFF'"
                                  stroke-width="4" stroke-linecap="round"
                                  :stroke-dasharray="aiRingDash.circumference"
                                  :stroke-dashoffset="aiRingDash.offset"/>
                        </svg>
                      </button>
                    </template>
                    <div class="text-xs text-[var(--color-text-primary)] space-y-1.5 min-w-[280px]">
                      <div class="font-semibold text-[11px] mb-1">上下文使用情况</div>
                      <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">本次输入 tokens</span><span>{{ formatAiTokens(aiUsage.promptTokens) }}</span></div>
                      <div v-if="aiUsage.cacheHitTokens > 0 || aiUsage.cacheMissTokens > 0" class="flex justify-between">
                        <span class="text-[var(--color-text-secondary)]">缓存命中 / 未命中</span>
                        <span>{{ formatAiTokens(aiUsage.cacheHitTokens) }} / {{ formatAiTokens(aiUsage.cacheMissTokens) }}</span>
                      </div>
                      <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">本次输出 tokens</span><span>{{ formatAiTokens(aiUsage.completionTokens) }}</span></div>
                      <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">本次合计 tokens</span><span>{{ formatAiTokens(aiUsage.totalTokens) }}</span></div>
                      <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">本次费用</span><span>{{ formatAiCost(aiUsage.cost) }}</span></div>
                      <div class="border-t border-[var(--color-border)] my-1.5"></div>
                      <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">累计 tokens</span><span>{{ formatAiTokens(aiUsage.cumulative.totalTokens) }}</span></div>
                      <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">累计费用</span><span>{{ formatAiCost(aiUsage.cumulative.cost) }}</span></div>
                      <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">上下文上限</span><span>{{ formatAiTokens(128000) }} tokens</span></div>
                      <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">当前占比</span><span>{{ aiUsagePercentText }}</span></div>
                    </div>
                  </el-popover>

                  <!-- 微型模型切换 -->
                  <el-dropdown trigger="click" @command="onModelSelect">
                    <button class="flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] text-[var(--color-text-secondary)] hover:text-blue-500 hover:bg-[var(--color-card-hover)] dark:hover:text-blue-400 transition-colors duration-300 cursor-pointer bg-transparent border-none"
                            :disabled="aiStreaming"
                            :class="aiStreaming ? 'opacity-50 cursor-not-allowed' : ''"
                            title="选择回答模型">
                      <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>
                      </svg>
                      <span>{{ selectedModel === 'pro' ? '专业版 pro' : '经济版 flash' }}</span>
                      <svg class="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
                      </svg>
                    </button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item v-for="m in aiModels" :key="m.key" :command="m.key">
                          <span class="flex items-center gap-2">
                            <span class="text-xs">{{ m.label }}</span>
                            <span class="text-[10px] text-[var(--color-text-secondary)]">¥{{ m.inputCacheMiss }}/¥{{ m.output }}</span>
                            <span v-if="selectedModel === m.key" class="text-blue-500 dark:text-blue-400">✓</span>
                          </span>
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>

                <el-button type="primary" :loading="aiStreaming" @click="sendAiMessage" size="small" circle>
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                  </svg>
                </el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- 口播稿面板 -->
        <div v-show="activeTab === 'script'" class="flex-1 overflow-y-auto p-4 no-scrollbar">
          <div class="text-xs leading-relaxed text-black dark:text-white space-y-3">
            <!-- 有口播稿时显示 -->
            <p v-if="currentScript">{{ currentScript }}</p>
            <!-- 无口播稿时显示提示 -->
            <p v-else class="text-[var(--color-text-secondary)]">该页暂无口播稿</p>
            <hr class="border-[var(--color-border)] my-3">
            <p class="text-[var(--color-text-secondary)] text-[10px]">* 口播稿由 AI 自动生成</p>
          </div>
        </div>
      </aside>

      <!-- 移动端提示 -->
      <div class="flex md:hidden flex-1 items-center justify-center p-8 text-center bg-[var(--color-card)]">
        <div>
          <svg class="w-16 h-16 mx-auto mb-4 text-[var(--color-text-secondary)] opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="2" y="3" width="20" height="14" rx="2" stroke-width="2"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 21h8m-4-4v4"/>
          </svg>
          <p class="text-sm text-[var(--color-text-secondary)]">请在平板或桌面端打开</p>
          <p class="text-xs text-[var(--color-text-secondary)] mt-1 opacity-60">课程播放器需要更大的屏幕</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script src="./script.js"></script>

<style scoped>
  /* 全屏按钮：hover ppt-container 时显示 */
  .ppt-hover-show {
    transition: opacity 500ms ease;
  }
  #ppt-container:hover .ppt-hover-show {
    opacity: 1 !important;
    pointer-events: auto !important;
  }
  /* 播放倍速 select 样式 */
  .speed-select {
    width: 80px;
  }
  .speed-select :deep(.el-input__wrapper) {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
    color: rgba(255,255,255,0.75);
    font-family: monospace;
    font-size: 11px;
  }
  .speed-select :deep(.el-input__wrapper:hover) {
    color: white;
  }
  /* AI 输入组件：textarea 去边框，与卡片底色融为一体 */
  .ai-composer :deep(.el-textarea__inner) {
    background: transparent;
    border: none;
    box-shadow: none;
    padding: 0;
    font-size: 12px;
    line-height: 1.6;
    resize: none;
  }
  .ai-composer :deep(.el-textarea__inner:focus) {
    box-shadow: none;
  }
  .ai-composer :deep(.el-textarea__inner:disabled) {
    background: transparent;
    cursor: not-allowed;
  }
  .ai-composer :deep(.el-textarea__inner::placeholder) {
    font-size: 12px;
  }
  /* 上下文用量圆环：底色圆（进度圆用内联 stroke 控制颜色） */
  .ai-ring-bg {
    stroke: var(--color-border);
  }
  /* AI 回答 Markdown 排版（v-html 内容，用 :deep 命中子元素） */
  .ai-msg-md :deep(p) { margin: 3px 0; }
  .ai-msg-md :deep(h1), .ai-msg-md :deep(h2), .ai-msg-md :deep(h3), .ai-msg-md :deep(h4) {
    font-size: 13px;
    font-weight: 600;
    margin: 7px 0 3px;
  }
  .ai-msg-md :deep(h1):first-child, .ai-msg-md :deep(h2):first-child, .ai-msg-md :deep(h3):first-child, .ai-msg-md :deep(h4):first-child {
    margin-top: 0;
  }
  .ai-msg-md :deep(ul), .ai-msg-md :deep(ol) {
    margin: 3px 0;
    padding-left: 18px;
  }
  .ai-msg-md :deep(ul) { list-style: disc; }
  .ai-msg-md :deep(ol) { list-style: decimal; }
  .ai-msg-md :deep(li) { margin: 2px 0; }
  .ai-msg-md :deep(code) {
    background: var(--color-card-hover);
    padding: 1px 4px;
    border-radius: 4px;
    font-size: 11px;
    font-family: Consolas, Monaco, "Courier New", monospace;
  }
  .ai-msg-md :deep(pre) {
    background: var(--color-card-hover);
    padding: 8px 10px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 6px 0;
  }
  .ai-msg-md :deep(pre code) {
    background: transparent;
    padding: 0;
  }
  .ai-msg-md :deep(strong) { font-weight: 600; }
  .ai-msg-md :deep(em) { font-style: italic; }
  .ai-msg-md :deep(a) { color: #409EFF; text-decoration: underline; }
  .ai-msg-md :deep(blockquote) {
    border-left: 3px solid var(--color-border);
    padding-left: 8px;
    margin: 4px 0;
    color: var(--color-text-secondary);
  }
  .ai-msg-md :deep(hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 6px 0;
  }
  .ai-msg-md :deep(table) { border-collapse: collapse; margin: 6px 0; }
  .ai-msg-md :deep(th), .ai-msg-md :deep(td) {
    border: 1px solid var(--color-border);
    padding: 3px 8px;
  }
</style>
