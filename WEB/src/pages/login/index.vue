<!--
============================================================================
文件名：index.vue（登录注册页面入口）
所属目录：src/pages/login/（login 页面的专属文件夹）
文件作用：登录/注册页面的 Vue SFC 入口组件
         Template 定义页面 HTML 结构（纯视图层，无业务逻辑）
         Script 通过 <script src="./script.js"> 引用同目录下的独立逻辑文件
         CSS 由 Tailwind 原子类 + Element Plus 组件库 提供

设计规范遵循：design-spec Skill（文字纯黑纯白、10px圆角、500ms过渡、Element Plus组件、暗黑双轨）

架构说明：
  本页面采用 template(HTML) / script(JS) 完全分离的架构：
    - template 块：纯 HTML 视图层，使用 Element Plus 组件 + Tailwind 布局
    - script 块：通过 src 引用同目录下的 script.js
                 该文件通过 export default { setup() } 导出所有逻辑
    - style 块：无，样式由 Tailwind CSS + Element Plus 共同提供

数据流：
  用户输入 → el-input v-model → email/code(ref) [script.js]
           → el-button @click → handleSendCode/handleLogin [script.js]
           → API/Store 调用 → 响应式变量更新 → 视图自动重新渲染

暴露给模板的变量/函数（由 script.js 的 setup() 返回）：
  @ref       email, code, codeInputRef           | 表单数据
  @ref       isSending, isSubmitting, countdown, message | UI 状态
  @ref       emailError, codeError               | 校验错误
  @computed  sendCodeButtonText, isProcessing    | 计算属性
  @function  handleSendCode, handleLogin, focusCodeInput | 事件处理方法

上次修改：2026-07-06（按 design-spec 规范重构）
============================================================================
-->

<template>
  <!--
  ============================================================
  页面整体布局
    - 垂直居中、纯白背景（暗黑：纯黑）
    - 全宽容器 + 响应式内边距（手机紧凑、桌面宽松）
    - 主题切换过渡 500ms
  ============================================================
  -->
  <div class="min-h-screen bg-white dark:bg-black flex flex-col items-center justify-center transition-colors duration-500">
    <!--
    ============================================================
    响应式外层容器
      - 全宽 + 响应式 padding：手机 px-4 / 平板 px-6 / 桌面 px-8 / 宽屏 px-16
      - 不限制 body 最大宽度，留给其他页面使用
    ============================================================
    -->
    <div class="w-full px-4 sm:px-6 lg:px-8 2xl:px-16 py-6 sm:py-8 lg:py-12 transition-colors duration-500">

      <!--
      ============================================================
      登录卡片：登录框是少量合理的居中场景，保留 max-w-md
        卡片背景白/暗黑 neutral-950，圆角 10px，过渡 500ms
      ============================================================
      -->
      <div class="bg-white dark:bg-neutral-950 rounded-[10px] shadow-lg dark:shadow-black/40 p-6 sm:p-8 max-w-md mx-auto w-full transition-all duration-500">

        <!-- ========== 标题区 ========== -->
        <!-- 标题纯黑纯白，暗黑模式同步 -->
        <h1 class="text-2xl font-bold text-black dark:text-white mb-1 text-center">
          金茂教材处理系统
        </h1>
        <!-- 次要文字 neutral-800 / dark:neutral-300 -->
        <p class="text-neutral-800 dark:text-neutral-300 text-center mb-6 text-sm">
          使用邮箱验证码登录或注册
        </p>

        <!--
        ============================================================
        邮箱输入区域（Element Plus el-input）
          v-model="email" → script.js 中的 email ref
          :disabled="isProcessing" → 请求中禁止编辑
          @keyup.enter → focusCodeInput() 跳转到验证码输入框
        ============================================================
        -->
        <div class="mb-4">
          <label class="block text-sm font-medium text-black dark:text-white mb-1" for="email">
            邮箱地址
          </label>
          <div class="flex gap-2">
            <el-input
              id="email"
              v-model="email"
              placeholder="请输入邮箱地址"
              :disabled="isProcessing"
              class="flex-1"
              size="large"
              @keyup.enter="focusCodeInput"
            />

            <!--
            发送验证码按钮（Element Plus el-button）
              type="primary" → 蓝色主色调
              :loading="isSending" → 发送中显示 loading 动画，自动 disabled
              :disabled="countdown > 0" → 倒计时中禁止点击
              文字 → sendCodeButtonText "发送验证码" 或 "Xs后重发"
            -->
            <el-button
              type="primary"
              :loading="isSending"
              :disabled="countdown > 0 || isProcessing"
              @click="handleSendCode"
              size="large"
            >
              {{ sendCodeButtonText }}
            </el-button>
          </div>

          <!-- 邮箱格式错误提示 -->
          <p v-if="emailError" class="text-red-500 text-xs mt-1">{{ emailError }}</p>
        </div>

        <!--
        ============================================================
        验证码输入区域（Element Plus el-input）
          v-model="code" → script.js 中的 code ref
          ref="codeInputRef" → 用于发送验证码后自动聚焦
          maxlength="6" → 限制最多6位
          @keyup.enter → handleLogin() 回车直接提交登录
        ============================================================
        -->
        <div class="mb-4">
          <label class="block text-sm font-medium text-black dark:text-white mb-1" for="code">
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
          />

          <!-- 验证码格式错误提示 -->
          <p v-if="codeError" class="text-red-500 text-xs mt-1">{{ codeError }}</p>
        </div>

        <!--
        ============================================================
        登录/注册提交按钮（Element Plus el-button）
          type="success" → 绿色确认操作（与原设计语义一致）
          :loading="isSubmitting" → 提交中显示 loading，自动 disabled
        ============================================================
        -->
        <el-button
          type="success"
          :loading="isSubmitting"
          :disabled="isProcessing && !isSubmitting"
          @click="handleLogin"
          size="large"
          class="w-full"
        >
          {{ isSubmitting ? '处理中...' : '登录 / 注册' }}
        </el-button>

        <!--
        ============================================================
        状态提示消息区（Element Plus el-alert）
          :type → 根据 message.type 自动切换主题色
          :title → 消息文本
          closable → 可手动关闭
          show-icon → 显示前缀图标
        ============================================================
        -->
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

      <!-- ========== 底部说明文字 ========== -->
      <!-- 辅助水印级别文字，使用 neutral-500，可豁免规则1 -->
      <p class="mt-6 text-neutral-500 dark:text-neutral-400 text-xs text-center transition-colors duration-500">
        未注册账号将自动创建 · 验证码5分钟内有效
      </p>
    </div>
  </div>
</template>

<!--
============================================================
Script 引用：通过 src 属性引入同目录下的独立逻辑文件

  script.js 通过 export default { setup() } 导出
  所有 setup() 返回的变量/函数自动暴露给 template 使用

  技术说明：
    - <script setup src="..."> 不被 Vue 编译器支持
    - 改用传统 <script src="..."> + export default { setup() }
    - 效果等同，只是写法稍有不同
============================================================
-->
<script src="./script.js"></script>
