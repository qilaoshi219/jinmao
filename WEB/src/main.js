// ==================== Vue 应用入口文件 ====================
// 职责：创建 Vue 3 应用实例，挂载全局插件（Pinia、样式），启动应用
// 这是整个前端项目的启动入口

import { createApp } from "vue"; // Vue 3 应用创建 API
import { createPinia } from "pinia"; // Pinia 状态管理

// 全局样式（Tailwind CSS + 暗黑模式 class 策略 + 主题 CSS 变量）
// index.css 内部会导入 tokens.css，确保主题变量在 Tailwind 之后加载
import "./styles/index.css";

// Element Plus 暗黑模式支持（检测 html.dark class 自动切换组件主题）
// 与 Tailwind dark: 变体共用同一个 html.dark 触发器，实现双轨同步切换
import "element-plus/theme-chalk/dark/css-vars.css";

// 根组件
import App from "./App.vue";

// ========== 创建应用实例 ==========
const app = createApp(App);

// ========== 挂载 Pinia 状态管理 ==========
// Pinia 是 Vue 3 官方推荐的状态管理库
// 通过 app.use() 安装后，所有组件都可使用 useAuthStore() 等 Store
const pinia = createPinia();
app.use(pinia);

console.log("[main] Pinia 状态管理已安装");

// ========== 挂载应用到 DOM ==========
// 挂载到 index.html 中的 #app 元素
app.mount("#app");

console.log("[main] Vue 3 应用已成功挂载");
