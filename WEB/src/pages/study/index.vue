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
      <!-- 右侧：学习工具 -->
      <div class="flex items-center gap-1.5">
        <button v-for="tool in studyTools" :key="tool.key"
                @click="tool.handler"
                class="hidden md:inline-flex items-center px-2 py-1 text-xs rounded-[10px] border
                       border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)]
                       hover:text-blue-500 hover:border-blue-500
                       dark:hover:text-blue-400 dark:hover:border-blue-400
                       transition-all duration-500 cursor-pointer">
          {{ tool.label }}
        </button>
        <button
          @click="toggleFavorite"
          :disabled="favoriteLoading"
          class="hidden md:inline-flex items-center justify-center w-7 h-7 rounded-[10px] border
                 border-[var(--color-border)] bg-transparent
                 transition-all duration-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          :class="isFavorite ? 'text-red-500 border-red-400' : 'text-[var(--color-text-secondary)] hover:text-blue-500 hover:border-blue-500 dark:hover:text-blue-400 dark:hover:border-blue-400'"
          :title="isFavorite ? '取消收藏' : '收藏课程'">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
          </svg>
        </button>
        <button
          @click="openCertificate"
          class="hidden md:inline-flex items-center px-2 py-1 text-xs rounded-[10px] border
                 border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)]
                 hover:text-blue-500 hover:border-blue-500
                 dark:hover:text-blue-400 dark:hover:border-blue-400
                 transition-all duration-500 cursor-pointer">
          结业证书
        </button>
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
      </div>
    </header>

    <!-- 文件补全横幅 -->
    <div v-if="isFixingMissing"
         class="flex items-center justify-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 transition-all duration-500">
      <svg class="w-4 h-4 text-amber-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
      </svg>
      <span class="text-xs text-amber-600 dark:text-amber-400">{{ fixingBannerText }}</span>
    </div>

    <!-- ===== 主体 ===== -->
    <!-- 桌面/全屏：横向分栏；移动常规：上下分栏（上播放区 + 下面板） -->
    <div class="flex flex-1 min-h-0 overflow-hidden"
         :class="(!isMobileView || mobileFullscreen) ? 'flex-row' : 'flex-col'">

      <!-- === 左侧边栏：课程目录 === -->
      <aside id="left-sidebar"
             class="flex-col flex-shrink-0 bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)] transition-colors duration-500"
             :class="isMobileView ? 'hidden' : 'md:flex'"
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
        <!-- 章节列表（桌面端折叠时通过 nav-id 定位隐藏列表） -->
        <ChapterList
          nav-id="sidebar-nav"
          :chapters="chapters"
          :active-chapter="activeChapter"
          :chapter-loading="chapterLoading"
          :course-loading="courseLoading"
          :total-pages="totalPages"
          :chapter-progress-map="chapterProgressMap"
          :generate-btn-disabled="generateBtnDisabled"
          :generate-btn-text="generateBtnText"
          :is-generating-chapter="isGeneratingChapter"
          :auto-generate-enabled="autoGenerateEnabled"
          :is-fixing-missing="isFixingMissing"
          :fixing-banner-text="fixingBannerText"
          :get-chapter-progress-label="getChapterProgressLabel"
          :get-chapter-progress-bar-width="getChapterProgressBarWidth"
          :get-chapter-progress-count-text="getChapterProgressCountText"
          @select="(ch) => switchChapter(ch.id)"
          @generate-next="handleGenerateNextChapter"
          @toggle-auto-generate="onAutoGenerateToggle"
        />
      </aside>

      <!-- === 左拖动手柄 === -->
      <div id="resize-handle-left"
           class="flex-shrink-0 w-[6px] cursor-col-resize relative z-20 transition-colors duration-500 hover:bg-blue-500 dark:hover:bg-blue-400"
           :class="isMobileView ? 'hidden' : 'md:block'"
           style="background:var(--color-border);"
           @mousedown="startResize('left', $event)">
        <div class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-blue-500 dark:bg-blue-400 opacity-0 group-hover:opacity-100"></div>
      </div>

      <!-- === 中间播放区 === -->
      <!-- 桌面：flex-1 自适应；移动竖屏：按 16:9 内容高度，避免挤占下面板；移动全屏：左侧 70% -->
      <section class="flex flex-col min-w-0 bg-[var(--color-bg-primary)] transition-colors duration-500"
               :class="isMobileView ? 'flex-shrink-0' : 'flex-1'"
               :style="mobileFullscreen ? { width: '70%' } : {}">
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

          <!-- PPT 容器（overflow-hidden 配合 iframe 缩放；桌面固定 16:9，移动端填满可用区域） -->
          <div id="ppt-container" ref="pptContainer"
               class="relative w-full border border-[var(--color-border)] z-10 transition-all duration-500 bg-[var(--color-card-hover)] overflow-hidden"
               :class="mobileFullscreen ? 'flex-1' : 'aspect-[16/9]'"
               @click="onPptClick"
               @mouseenter="onPptMouseEnter"
               @mouseleave="onPptMouseLeave">

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

            <!-- 全屏按钮（桌面端，hover 显示） -->
            <button @click.stop="toggleFullscreen"
                    class="absolute top-2 right-2 z-30 items-center justify-center w-7 h-7 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text-secondary)] hover:text-blue-500 hover:border-blue-500 dark:hover:text-blue-400 dark:hover:border-blue-400 transition-all duration-500 cursor-pointer opacity-0 pointer-events-none ppt-hover-show"
                    :class="isMobileView ? 'hidden' : 'flex'"
                    title="全屏">
              <svg v-show="!isFullscreen" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
              </svg>
              <svg v-show="isFullscreen" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/>
              </svg>
            </button>

            <!-- 全屏按钮（移动端，常驻显示，切换横屏 3:7 布局） -->
            <button @click.stop="toggleMobileFullscreen"
                    class="absolute top-2 right-2 z-30 items-center justify-center w-7 h-7 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text-secondary)] hover:text-blue-500 hover:border-blue-500 dark:hover:text-blue-400 dark:hover:border-blue-400 transition-all duration-500 cursor-pointer"
                    :class="isMobileView ? 'flex' : 'hidden'"
                    :title="mobileFullscreen ? '退出全屏' : '全屏'">
              <svg v-show="!mobileFullscreen" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
              </svg>
              <svg v-show="mobileFullscreen" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

            <!-- 播放控件 (桌面 hover 显示；移动端点按 PPT 显示，5 秒自动隐藏) -->
            <div ref="playerControls"
                 class="absolute bottom-0 left-0 right-0 z-30 transition-opacity duration-[400ms]"
                 style="opacity:0;pointer-events:none;"
                 @click.stop
                 @mouseenter="onControlsMouseEnter"
                 @mouseleave="onControlsMouseLeave">
              <!-- 渐变遮罩 -->
              <div class="h-20 pointer-events-none" style="background:linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%);"></div>
              <!-- 控件 -->
              <div class="absolute bottom-0 left-0 right-0">
                <!-- 进度条：点击/拖动跳转到对应页面的对应时间（章节累计时间映射） -->
                <div class="relative h-4 mx-3 cursor-pointer group select-none"
                     @pointerdown="onBarPointerDown"
                     @pointermove="onBarPointerMove"
                     @pointerup="onBarPointerUp"
                     @pointercancel="onBarPointerCancel">
                  <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-white/20 overflow-hidden rounded-[10px]">
                    <div class="absolute inset-y-0 left-0 bg-blue-500 dark:bg-blue-400 transition-all duration-300"
                         :style="{ width: (dragPercent ?? progressPercent) + '%' }"></div>
                  </div>
                  <div class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-blue-500 dark:bg-blue-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                       :style="{ left: (dragPercent ?? progressPercent) + '%' }"></div>
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
                    <button @click="toggleAutoPlay" class="items-center gap-1 px-2 h-7 rounded-[10px] text-[11px] transition-all cursor-pointer bg-transparent text-white/75 hover:text-white"
                            :class="isMobileView ? 'hidden' : 'flex'"
                            title="自动播放">
                      <span>自动</span>
                      <span class="inline-block w-1.5 h-1.5 rounded-full" :class="autoPlay ? 'bg-green-500' : 'bg-white/40'"></span>
                    </button>
                    <el-select v-model="playbackSpeed" size="small" class="speed-select" placeholder="1.0x"
                               :class="isMobileView ? 'hidden' : ''">
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
           class="flex-shrink-0 w-[6px] cursor-col-resize relative z-20 transition-colors duration-500 hover:bg-blue-500 dark:hover:bg-blue-400"
           :class="isMobileView ? 'hidden' : 'lg:block'"
           style="background:var(--color-border);"
           @mousedown="startResize('right', $event)">
        <div class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-blue-500 dark:bg-blue-400 opacity-0 group-hover:opacity-100"></div>
      </div>

      <!-- === 右侧边栏：AI助教 + 口播稿 === -->
      <aside id="right-sidebar"
             class="flex-col flex-shrink-0 bg-[var(--color-bg-secondary)] border-l border-[var(--color-border)] transition-colors duration-500"
             :class="isMobileView ? 'hidden' : 'lg:flex'"
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

        <!-- AI 助教面板（桌面右栏） -->
        <AiChatPanel
          v-show="activeTab === 'ai'"
          ref="aiDesktopPanelRef"
          :current-chapter-title="currentChapterTitle"
          :active-conversation-id="activeConversationId"
          :history="aiHistory"
          :messages="aiMessages"
          v-model:input="aiInput"
          :streaming="aiStreaming"
          :models="aiModels"
          v-model:selected-model="selectedModel"
          :usage="aiUsage"
          :usage-percent="aiUsagePercent"
          :usage-percent-text="aiUsagePercentText"
          :ring-dash="aiRingDash"
          @send="sendAiMessage"
          @new-conversation="startNewAiConversation"
          @open-conversation="openAiConversation"
          @use-suggestion="useSuggestion"
          @model-select="onModelSelect"
        />

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

      <!-- === 移动端面板：常规态位于底部（上下分栏），全屏态位于右侧（3:7 分栏） === -->
      <div class="flex-col min-h-0 min-w-0 bg-[var(--color-bg-secondary)] border-[var(--color-border)] transition-colors duration-500"
           :class="[
             isMobileView ? 'flex' : 'hidden',
             mobileFullscreen ? 'flex-shrink-0' : 'flex-1',
             mobileFullscreen ? 'border-l' : 'border-t'
           ]"
           :style="mobileFullscreen ? { width: '30%' } : {}">
        <!-- Tab 切换（默认 AI 助教；全屏态标签为"聊天"；口播稿在移动端屏蔽） -->
        <div class="flex border-b border-[var(--color-border)] flex-shrink-0">
          <button @click="mobilePanelTab = 'ai'"
                  class="flex-1 py-2.5 text-xs font-medium transition-all duration-500 border-b-2 bg-transparent cursor-pointer"
                  :class="mobilePanelTab === 'ai' ? 'text-blue-500 dark:text-blue-400 border-b-blue-500 dark:border-b-blue-400' : 'text-[var(--color-text-secondary)] border-b-transparent'">
            {{ mobileFullscreen ? '聊天' : 'AI 助教' }}
          </button>
          <button @click="mobilePanelTab = 'chapter'"
                  class="flex-1 py-2.5 text-xs font-medium transition-all duration-500 border-b-2 bg-transparent cursor-pointer"
                  :class="mobilePanelTab === 'chapter' ? 'text-blue-500 dark:text-blue-400 border-b-blue-500 dark:border-b-blue-400' : 'text-[var(--color-text-secondary)] border-b-transparent'">
            章节
          </button>
        </div>

        <!-- AI 助教 / 聊天 -->
        <AiChatPanel
          v-show="mobilePanelTab === 'ai'"
          ref="aiMobilePanelRef"
          :current-chapter-title="currentChapterTitle"
          :active-conversation-id="activeConversationId"
          :history="aiHistory"
          :messages="aiMessages"
          v-model:input="aiInput"
          :streaming="aiStreaming"
          :models="aiModels"
          v-model:selected-model="selectedModel"
          :usage="aiUsage"
          :usage-percent="aiUsagePercent"
          :usage-percent-text="aiUsagePercentText"
          :ring-dash="aiRingDash"
          @send="sendAiMessage"
          @new-conversation="startNewAiConversation"
          @open-conversation="openAiConversation"
          @use-suggestion="useSuggestion"
          @model-select="onModelSelect"
        />

        <!-- 章节 -->
        <ChapterList
          v-show="mobilePanelTab === 'chapter'"
          :chapters="chapters"
          :active-chapter="activeChapter"
          :chapter-loading="chapterLoading"
          :course-loading="courseLoading"
          :total-pages="totalPages"
          :chapter-progress-map="chapterProgressMap"
          :generate-btn-disabled="generateBtnDisabled"
          :generate-btn-text="generateBtnText"
          :is-generating-chapter="isGeneratingChapter"
          :auto-generate-enabled="autoGenerateEnabled"
          :is-fixing-missing="isFixingMissing"
          :fixing-banner-text="fixingBannerText"
          :get-chapter-progress-label="getChapterProgressLabel"
          :get-chapter-progress-bar-width="getChapterProgressBarWidth"
          :get-chapter-progress-count-text="getChapterProgressCountText"
          @select="(ch) => switchChapter(ch.id)"
          @generate-next="handleGenerateNextChapter"
          @toggle-auto-generate="onAutoGenerateToggle"
        />
      </div>
    </div>

    <!-- 学习工具弹窗 -->
    <ReviewOutlineDialog
      v-model:visible="reviewOutlineVisible"
      :course-id="courseId"
      :course-name="courseInfo.name"
    />
    <ChapterQuizDialog
      v-model:visible="chapterQuizVisible"
      :course-id="courseId"
      :chapter-id="activeChapter"
      :chapter-name="currentChapterTitle"
    />
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
</style>
