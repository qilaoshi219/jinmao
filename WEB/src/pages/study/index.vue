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
      <span class="text-xs text-[var(--color-text-secondary)] truncate max-w-[50%]">高等数学第一章 极限与连续</span>
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
          <div v-for="ch in chapters" :key="ch.id"
               class="flex items-center gap-2 px-3 py-2 mx-1 cursor-pointer transition-all duration-500 border-l-[3px] hover:bg-[var(--color-card-hover)]"
               :class="[ch.id === activeChapter ? 'border-l-blue-500 dark:border-l-blue-400 bg-[var(--color-card-hover)]' : 'border-l-transparent']"
               @click="activeChapter = ch.id">
            <!-- 状态图标 -->
            <span v-if="ch.status === 'completed'"
                  class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-500 text-white text-[10px] font-bold flex-shrink-0">
              &#10003;
            </span>
            <span v-else-if="ch.status === 'active'"
                  class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] font-bold flex-shrink-0">
              &#9654;
            </span>
            <span v-else
                  class="inline-flex items-center justify-center w-4 h-4 rounded-full border border-[var(--color-border)] flex-shrink-0"></span>
            <!-- 编号 -->
            <span class="text-[11px] font-mono flex-shrink-0 w-5"
                  :class="[ch.id === activeChapter ? 'text-blue-500 dark:text-blue-400 font-semibold' : 'text-[var(--color-text-secondary)]']">
              {{ String(ch.id).padStart(2, '0') }}
            </span>
            <!-- 标题 -->
            <span class="text-xs flex-1 truncate"
                  :class="[ch.id === activeChapter ? 'text-black dark:text-white font-medium' : 'text-[var(--color-text-secondary)]']">
              {{ ch.title }}
            </span>
            <!-- 时长 -->
            <span class="text-[10px] font-mono flex-shrink-0"
                  :class="[ch.id === activeChapter ? 'text-blue-500 dark:text-blue-400' : 'text-[var(--color-text-secondary)]']">
              {{ ch.duration }}
            </span>
          </div>
        </nav>
        <!-- 底部状态 -->
        <div class="px-3 py-2 border-t border-[var(--color-border)]">
          <div class="flex items-center gap-1.5 text-[10px] text-[var(--color-text-secondary)]">
            <span class="inline-block w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400 animate-pulse"></span>
            <span>下一章生成中...</span>
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

          <!-- PPT 16:9 容器 -->
          <div id="ppt-container" ref="pptContainer"
               class="relative w-full aspect-[16/9] border border-[var(--color-border)] flex flex-col items-center justify-center z-10 transition-all duration-500 bg-[var(--color-card-hover)]"
               @mouseenter="showControls"
               @mouseleave="hideControls">

            <!-- 内边框 -->
            <div class="absolute inset-1 border border-[var(--color-border)] pointer-events-none"></div>
            <!-- 占位图标 -->
            <svg class="w-12 h-12 text-[var(--color-text-secondary)] mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"/>
            </svg>
            <span class="text-sm text-[var(--color-text-secondary)] font-mono tracking-wider">PPT 课件 第 {{ currentPage }} 页</span>
            <span class="text-[10px] text-[var(--color-text-secondary)] mt-1 opacity-60">{{ currentChapterTitle }}</span>

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
                  <span class="font-mono text-xs text-white/75 tracking-wider">{{ formattedTime }} / {{ totalTime }}</span>
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
          <div class="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar">
            <div v-for="(msg, i) in aiMessages" :key="i"
                 :class="['flex', msg.role === 'user' ? 'justify-end' : 'justify-start']">
              <div class="max-w-[85%] px-3 py-2 rounded-[10px] text-xs leading-relaxed"
                   :class="msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-[var(--color-card-hover)] text-black dark:text-white'">
                {{ msg.text }}
              </div>
            </div>
          </div>
          <!-- AI 输入 -->
          <div class="flex items-center gap-2 px-3 py-2 border-t border-[var(--color-border)]">
            <el-input v-model="aiInput" placeholder="输入问题..." size="small"
                      @keyup.enter="sendAiMessage"/>
            <el-button type="primary" @click="sendAiMessage" size="small" circle>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
              </svg>
            </el-button>
          </div>
        </div>

        <!-- 口播稿面板 -->
        <div v-show="activeTab === 'script'" class="flex-1 overflow-y-auto p-4 no-scrollbar">
          <div class="text-xs leading-relaxed text-black dark:text-white space-y-3">
            <p>导数是微积分的基础概念之一。在数学中，导数被定义为函数输出值的增量与自变量增量的比值在自变量增量趋于零时的极限。</p>
            <p>设有函数 y = f(x)，在点 x 的某个邻域内有定义。当自变量 x 在 x 处取得增量 Δx 时，函数相应地取得增量 Δy = f(x + Δx) - f(x)。</p>
            <p>如果当 Δx → 0 时，Δy/Δx 的极限存在，则称该极限为函数 f(x) 在点 x 处的导数。</p>
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
</style>
