<!--
============================================================================
文件名：pages/mindmap/index.vue（课程思维导图页面）
文件作用：以 SVG 树状图展示 课程 → 章节 → 每页要点标题，支持滚动查看
遵守设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、暗黑双轨适配、蓝色主色
============================================================================
-->

<template>
  <div class="min-h-screen flex flex-col transition-colors duration-500"
       :style="{ backgroundColor: 'var(--color-bg-primary)' }">

    <!-- 顶部栏 -->
    <header class="flex items-center px-5 py-3 border-b transition-colors duration-500"
            :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
      <el-button size="small" text class="text-black dark:text-white" @click="goBack">
        返回学习
      </el-button>
      <h1 class="text-sm font-bold text-black dark:text-white ml-3 transition-colors duration-500">
        思维导图
      </h1>
      <span v-if="data" class="ml-3 text-xs text-gray-400 dark:text-gray-500 truncate">
        {{ data.courseName }}
      </span>
    </header>

    <!-- 加载中 -->
    <div v-if="loading" class="flex-1 flex flex-col items-center justify-center gap-3">
      <el-icon class="is-loading" :size="30"><Loading /></el-icon>
      <span class="text-sm text-black dark:text-white">加载思维导图中...</span>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="error" class="flex-1 flex flex-col items-center justify-center gap-4">
      <p class="text-sm text-red-500">{{ error }}</p>
      <el-button type="primary" @click="loadMindMap">重试</el-button>
    </div>

    <!-- 空数据 -->
    <div v-else-if="!data" class="flex-1 flex items-center justify-center text-gray-400">
      暂无思维导图数据
    </div>

    <!-- 思维导图 -->
    <main v-else class="flex-1 overflow-auto p-5">
      <div class="rounded-[10px] border transition-colors duration-500"
           :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
        <svg :viewBox="'0 0 760 ' + svgHeight" class="w-full" style="min-width:760px;">
          <!-- 连接线 -->
          <g stroke="#3b82f6" stroke-width="1.5" fill="none" opacity="0.45">
            <template v-for="(ch, i) in layout.chapters" :key="'cl' + i">
              <path :d="'M160 ' + layout.courseY + ' C240 ' + layout.courseY + ', 240 ' + ch.y + ', 300 ' + ch.y" />
              <path v-for="(s, si) in ch.slides" :key="'sl' + i + '-' + si"
                    :d="'M420 ' + ch.y + ' C480 ' + ch.y + ', 480 ' + s.y + ', 540 ' + s.y" />
            </template>
          </g>

          <!-- 课程根节点 -->
          <g>
            <rect x="30" :y="layout.courseY - 22" rx="10" ry="10"
                  width="130" height="44"
                  class="fill-blue-500 dark:fill-blue-400" />
            <text x="95" :y="layout.courseY + 5" text-anchor="middle"
                  class="fill-white text-[12px] font-bold">
              {{ truncate(data.courseName, 12) }}
            </text>
          </g>

          <!-- 章节节点 + 要点节点 -->
          <g v-for="(ch, ci) in layout.chapters" :key="'ch' + ci">
            <rect :x="300" :y="ch.y - 16" rx="10" ry="10" width="120" height="32"
                  class="fill-blue-50 dark:fill-blue-900/30 stroke-blue-500 dark:stroke-blue-400"
                  stroke-width="1" />
            <text :x="360" :y="ch.y + 4" text-anchor="middle"
                  class="fill-black dark:fill-white text-[11px] font-semibold">
              {{ truncate(ch.name, 13) }}
            </text>

            <g v-for="(s, si) in ch.slides" :key="'s' + si">
              <circle :cx="540" :cy="s.y" r="4" class="fill-blue-500 dark:fill-blue-400" />
              <text :x="554" :y="s.y + 3.5"
                    class="fill-black dark:fill-white text-[11px]">
                {{ s.title }}
              </text>
              <text :x="554" :y="s.y + 16"
                    class="fill-gray-400 dark:fill-gray-500 text-[9px]">
                第 {{ s.page }} 页
              </text>
            </g>
          </g>
        </svg>
      </div>
      <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-3 text-center">
        课程 → 章节 → 每页要点（点击章节可返回学习页继续学习）
      </p>
    </main>
  </div>
</template>

<script src="./script.js"></script>
