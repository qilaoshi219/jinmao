<!--
============================================================================
文件名：index.vue（登录注册页面入口）
所属目录：src/pages/login/（login 页面的专属文件夹）
文件作用：登录/注册页面的 Vue SFC 入口组件（美化版）
         Template 定义页面 HTML 结构（纯视图层，无业务逻辑）
         Script 通过 <script src="./script.js"> 引用同目录下的独立逻辑文件

美化设计要点：
  1. 背景装饰：蓝色渐变光晕（纯 CSS，无外部图片依赖）
  2. Logo 品牌区：蓝色圆形 + 书本 SVG 图标
  3. 卡片顶部蓝色渐变装饰条
  4. 输入框前缀图标：邮件图标 / 锁图标
  5. 分区设计：邮箱区和验证码区各自浅灰背景包裹
  6. 入场动画：fade-in + slide-up（500ms）
  7. 响应式按钮：手机端竖排、桌面端横排

设计规范遵循：design-spec Skill（纯黑纯白文字、10px圆角、500ms过渡、蓝色主调）
============================================================================
-->

<template>
  <!--
  ============================================================
  背景装饰：两个大尺寸蓝色渐变光晕
    - 右上角：bg-blue-500/10（暗黑模式：更明显 /20）
    - 左下角：bg-blue-400/10（暗黑模式：更明显 /15）
    pointer-events-none：不阻挡用户交互
  ============================================================
  -->
  <div class="fixed -top-40 -right-40 w-96 h-96 bg-blue-500/10 dark:bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
  <div class="fixed -bottom-40 -left-40 w-96 h-96 bg-blue-400/10 dark:bg-blue-400/15 rounded-full blur-3xl pointer-events-none" />

  <!--
  ============================================================
  页面整体布局
    - 垂直居中、纯白背景（暗黑：纯黑）
    - 全宽容器 + 响应式内边距
    - 主题切换过渡 500ms
  ============================================================
  -->
  <div class="relative min-h-screen bg-white dark:bg-black flex flex-col items-center justify-center transition-colors duration-500">
    <!--
    ============================================================
    响应式外层容器
      - 全宽 + 响应式 padding：手机 px-4 / 平板 px-6 / 桌面 px-8 / 宽屏 px-16
      - 不限制 body 最大宽度
    ============================================================
    -->
    <div class="w-full px-4 sm:px-6 lg:px-8 2xl:px-16 py-6 sm:py-8 lg:py-12 transition-colors duration-500">

      <!--
      ============================================================
      登录卡片容器
        外层：卡片阴影包裹
        顶部：蓝色渐变装饰条（h-1）
        内部：白色背景 + 入场动画（fade-in-up）
      ============================================================
      -->
      <div class="max-w-md mx-auto w-full">
        <!-- 卡片顶部蓝色渐变装饰条 -->
        <div class="h-1 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 rounded-t-[10px]" />
        <!-- 卡片主体 + 入场动画 -->
        <div class="bg-white dark:bg-neutral-950 rounded-b-[10px] shadow-lg dark:shadow-black/40 p-6 sm:p-8 animate-fade-in-up transition-all duration-500">

          <!-- ============================================================
          Logo 品牌区
            蓝色圆形背景 + 书本 SVG 图标
            增强品牌识别，提升视觉层次
          ============================================================ -->
          <div class="flex justify-center mb-4">
            <div class="w-14 h-14 rounded-full bg-blue-500 dark:bg-blue-400 flex items-center justify-center shadow-lg shadow-blue-500/30 dark:shadow-blue-400/30">
              <!-- 书本图标 SVG（Heroicons 风格） -->
              <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          </div>

          <!-- ========== 标题区 ========== -->
          <h1 class="text-2xl font-bold text-black dark:text-white text-center">
            金茂教材处理系统
          </h1>
          <!-- 蓝色装饰分割线 -->
          <div class="w-10 h-0.5 bg-blue-500 dark:bg-blue-400 mx-auto my-3 rounded-full" />
          <p class="text-neutral-800 dark:text-neutral-300 text-center mb-6 text-sm">
            使用邮箱验证码登录或注册
          </p>

          <!-- ============================================================
          邮箱输入区域
            浅灰背景容器包裹，视觉分区清晰
            el-input 带 Message 图标前缀
            按钮响应式：手机端竖排、桌面端横排
          ============================================================ -->
          <div class="bg-gray-50 dark:bg-neutral-900 rounded-[10px] p-4 mb-4 transition-colors duration-500">
            <label class="block text-sm font-medium text-black dark:text-white mb-2" for="email">
              邮箱地址
            </label>
            <div class="flex flex-col sm:flex-row gap-2">
              <el-input
                id="email"
                v-model="email"
                placeholder="请输入邮箱地址"
                :disabled="isProcessing"
                size="large"
                class="flex-1"
                @keyup.enter="focusCodeInput"
              >
                <!-- 邮箱图标前缀 -->
                <template #prefix>
                  <el-icon><Message /></el-icon>
                </template>
              </el-input>

              <el-button
                type="primary"
                :loading="isSending"
                :disabled="countdown > 0 || isProcessing"
                @click="handleSendCode"
                size="large"
                class="sm:flex-shrink-0"
              >
                {{ sendCodeButtonText }}
              </el-button>
            </div>

            <!-- 邮箱格式错误提示 -->
            <p v-if="emailError" class="text-red-500 dark:text-red-400 text-xs mt-2">{{ emailError }}</p>
          </div>

          <!-- ============================================================
          验证码输入区域
            浅灰背景容器包裹
            el-input 带 Lock 图标前缀
          ============================================================ -->
          <div class="bg-gray-50 dark:bg-neutral-900 rounded-[10px] p-4 mb-4 transition-colors duration-500">
            <label class="block text-sm font-medium text-black dark:text-white mb-2" for="code">
              验证码
            </label>
            <el-input
              id="code"
              ref="codeInputRef"
              v-model="code"
              placeholder="请输入6位验证码"
              maxlength="6"
              :disabled="isProcessing"
              size="large"
              class="verification-code-input"
              @keyup.enter="handleLogin"
            >
              <!-- 锁图标前缀（安全/验证语义） -->
              <template #prefix>
                <el-icon><Lock /></el-icon>
              </template>
            </el-input>

            <!-- 验证码格式错误提示 -->
            <p v-if="codeError" class="text-red-500 dark:text-red-400 text-xs mt-2">{{ codeError }}</p>
          </div>

          <!-- ============================================================
          登录/注册提交按钮
            type="primary" 蓝色，与整体蓝色简约风格统一
            :loading="isSubmitting" 防重复点击
          ============================================================ -->
          <el-button
            type="primary"
            :loading="isSubmitting"
            :disabled="isProcessing && !isSubmitting"
            @click="handleLogin"
            size="large"
            class="w-full"
          >
            {{ isSubmitting ? '处理中...' : '登录 / 注册' }}
          </el-button>

          <!-- ============================================================
          状态提示消息区（Element Plus el-alert）
          ============================================================ -->
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

      <!-- ========== 底部说明文字 ========== -->
      <p class="mt-6 text-neutral-500 dark:text-neutral-400 text-xs text-center transition-colors duration-500">
        未注册账号将自动创建 · 验证码5分钟内有效
      </p>
    </div>
  </div>
</template>

<!--
============================================================
Script 引用：通过 src 属性引入同目录下的独立逻辑文件
============================================================
-->
<script src="./script.js"></script>

<style scoped>
/* 入场动画：淡入 + 上滑（500ms） */
/* forwards 而非 both：只保持终态，不应用 backwards，
   避免 Chrome 扩展注入导致重渲染时闪回 opacity:0 */
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 500ms ease-out forwards;
}
</style>
