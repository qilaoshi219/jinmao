<!--
============================================================================
文件名：index.vue（登录注册页面入口）
所属目录：src/pages/login/
文件作用：登录/注册页面的 Vue SFC 入口组件
         NERV 蓝色战术风格 — 左右双栏布局
         Template 定义页面 HTML 结构（纯视图层）
         Script 通过 <script src="./script.js"> 引用业务逻辑

设计规范遵循：
  - 规则1：文字纯黑纯白 (text-black / dark:text-white)
  - 规则2：圆角 10px (rounded-[10px])
  - 规则3：过渡 500ms (duration-500)
  - 规则4：按钮防重复点击（:loading + :disabled）
  - 规则5：body 不限宽
  - 规则6：Element Plus 组件优先
  - 规则7：暗黑双轨适配
  - 规则9：主色 blue-500 / blue-400
============================================================================
-->

<template>
  <!--
  ============================================================
  页面整体 — NERV 蓝色战术背景
    - 全屏 flex 居中
    - 战术网格背景 + CRT 扫描线
    - 主题切换 500ms
  ============================================================
  -->
  <div class="relative min-h-screen flex items-center justify-center overflow-hidden transition-colors duration-500 bg-[var(--color-bg-primary)]">

    <!-- 战术网格背景 -->
    <div class="absolute inset-0 pointer-events-none z-0"
         style="background-image:linear-gradient(var(--color-rail) 1px,transparent 1px),linear-gradient(90deg,var(--color-rail) 1px,transparent 1px);background-size:20px 20px;opacity:0.04;"></div>

    <!-- CRT 扫描线效果 -->
    <div class="absolute inset-0 pointer-events-none z-0"
         style="background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.02) 2px,rgba(0,0,0,0.02) 4px);"></div>

    <!-- 右上角：主题切换按钮 -->
    <button id="theme-toggle"
            class="absolute top-4 right-4 z-20 w-9 h-9 flex items-center justify-center rounded-[10px] border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text-secondary)] hover:text-blue-500 hover:border-blue-500 dark:hover:text-blue-400 dark:hover:border-blue-400 transition-all duration-500 cursor-pointer"
            title="切换主题">
      <!-- 太阳图标（暗黑模式下显示） -->
      <svg v-show="isDark" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="5" stroke-width="2"/>
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <!-- 月亮图标（亮色模式下显示） -->
      <svg v-show="!isDark" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <!--
    ============================================================
    主体卡片 — 左右双栏
    ============================================================
    -->
    <div class="relative z-10 w-full max-w-4xl mx-4 flex flex-col lg:flex-row rounded-[10px] border border-[var(--color-border)] shadow-[var(--shadow-card)] overflow-hidden transition-all duration-500 bg-[var(--color-card)]">

      <!-- ===== 左栏：品牌展示区 ===== -->
      <div class="flex-1 flex flex-col items-center justify-center p-8 lg:p-12 relative min-h-[280px] transition-colors duration-500 bg-[var(--color-card)]">

        <!-- 战术网格叠加（仅左栏） -->
        <div class="absolute inset-0 pointer-events-none"
             style="background-image:linear-gradient(var(--color-rail) 1px,transparent 1px),linear-gradient(90deg,var(--color-rail) 1px,transparent 1px);background-size:20px 20px;opacity:0.04;"></div>

        <!-- 角括号装饰：左上 -->
        <div class="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-[var(--color-rail)] pointer-events-none z-10"></div>
        <!-- 角括号装饰：右下 -->
        <div class="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-[var(--color-rail)] pointer-events-none z-10"></div>

        <!-- 品牌内容 -->
        <div class="relative z-10 text-center">
          <!-- 主标题 -->
          <h1 class="text-3xl lg:text-4xl font-black tracking-wider text-black dark:text-white transition-colors duration-500"
              style="text-shadow:0 0 30px var(--color-rail);">
            金毛教你学
          </h1>
          <!-- 副标题 -->
          <p class="mt-2 text-xs font-mono tracking-[0.2em] text-[var(--color-text-secondary)] transition-colors duration-500">
            自学平台
          </p>
          <!-- 分割线 -->
          <div class="w-12 h-[2px] mx-auto mt-4 rounded-[1px] bg-blue-500 dark:bg-blue-400 transition-colors duration-500"></div>
          <!-- 今日金句 -->
          <blockquote class="mt-5 text-[11px] leading-relaxed text-[var(--color-text-secondary)] italic max-w-[260px] mx-auto transition-colors duration-500">
            "学而不思则罔，思而不学则殆。"
          </blockquote>
          <p class="mt-1 text-[10px] text-[var(--color-text-secondary)] opacity-60 transition-colors duration-500">
            — 《论语·为政》
          </p>
        </div>
      </div>

      <!-- ===== 右栏：登录表单 ===== -->
      <div class="flex-1 flex flex-col justify-center p-8 lg:p-12 transition-colors duration-500 relative bg-[var(--color-card)]"
           style="border-left:3px solid var(--color-rail);">

        <!-- 标题 -->
        <h2 class="text-xl font-bold text-black dark:text-white tracking-wide transition-colors duration-500">
          欢迎使用金毛教你学
        </h2>
        <p class="mt-1 text-xs text-[var(--color-text-secondary)] transition-colors duration-500">
          登录后开始你的学习之旅
        </p>

        <!-- ===== 邮箱输入 ===== -->
        <div class="mt-6">
          <label class="block text-xs font-medium text-black dark:text-white mb-1.5 transition-colors duration-500">
            邮箱地址
          </label>
          <el-input
            id="email"
            v-model="email"
            placeholder="请输入邮箱地址"
            :disabled="isProcessing"
            size="large"
            @keyup.enter="focusCodeInput"
          />
          <p v-if="emailError" class="text-red-500 dark:text-red-400 text-xs mt-1.5 transition-colors duration-500">
            {{ emailError }}
          </p>
        </div>

        <!-- ===== 验证码输入 + 发送按钮 ===== -->
        <div class="mt-4">
          <label class="block text-xs font-medium text-black dark:text-white mb-1.5 transition-colors duration-500">
            验证码
          </label>
          <div class="flex gap-2">
            <el-input
              id="code"
              ref="codeInputRef"
              v-model="code"
              placeholder="6位验证码"
              maxlength="6"
              :disabled="isProcessing"
              size="large"
              class="flex-1"
              @keyup.enter="handleLogin"
            />
            <el-button
              type="primary"
              :loading="isSending"
              :disabled="countdown > 0 || isProcessing"
              @click="handleSendCode"
              size="large"
              class="flex-shrink-0"
            >
              {{ sendCodeButtonText }}
            </el-button>
          </div>
          <p v-if="codeError" class="text-red-500 dark:text-red-400 text-xs mt-1.5 transition-colors duration-500">
            {{ codeError }}
          </p>
        </div>

        <!-- ===== 用户协议文案 ===== -->
        <p class="mt-3 text-[10px] text-[var(--color-text-secondary)] opacity-60 transition-colors duration-500">
          登录即表示同意
          <a href="#" class="text-blue-500 dark:text-blue-400 hover:underline transition-colors duration-500">用户协议</a>
          和
          <a href="#" class="text-blue-500 dark:text-blue-400 hover:underline transition-colors duration-500">隐私政策</a>
        </p>

        <!-- ===== 登录按钮 ===== -->
        <el-button
          type="primary"
          :loading="isSubmitting"
          :disabled="isProcessing && !isSubmitting"
          @click="handleLogin"
          size="large"
          class="w-full mt-4"
        >
          {{ isSubmitting ? '处理中...' : '开始学习' }}
        </el-button>

        <!-- ===== 状态提示 ===== -->
        <el-alert
          v-if="message.text"
          :type="message.type || 'info'"
          :title="message.text"
          :closable="true"
          show-icon
          class="mt-4"
          @close="message = { text: '', type: '' }"
        />
      </div>
    </div>

    <!-- 底部提示 -->
    <p class="absolute bottom-4 left-0 right-0 text-center text-[10px] text-[var(--color-text-secondary)] opacity-50 select-none transition-colors duration-500">
      未注册账号将自动创建 · 验证码5分钟内有效 · © 金毛教你学
    </p>
  </div>
</template>

<!-- Script 逻辑引用（包含主题切换） -->
<script src="./script.js"></script>
