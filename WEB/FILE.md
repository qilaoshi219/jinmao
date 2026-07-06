# FILE.md - WEB 前端项目文件索引

> 最后更新：2026-07-06

## 项目目录结构

```
WEB/
├── public/                          # 静态资源（不经过构建）
│   └── favicon.ico                  # 网站图标
├── src/
│   ├── api/                         # API 请求层
│   │   ├── client.js                # Axios 实例（baseURL、拦截器、Token 注入、401 处理）
│   │   ├── auth.js                  # 认证相关 API：sendCode、login、getProfile、updateProfile
│   │   └── books.js                 # 教材相关 API：uploadBook、listBooks、getBookDetail、getBookStatus
│   ├── composables/                 # 组合式函数（Composables）
│   │   └── useTheme.js              # 主题切换：封装 VueUse useDark，导出 isDark 和 toggleTheme
│   ├── pages/                       # 页面组件（每个页面一个独立子文件夹）
│   │   └── login/                    # 登录注册页面专属文件夹
│       ├── index.vue             # 页面入口：Element Plus 组件 + Tailwind 布局（符合 design-spec）
│       └── script.js             # 页面逻辑：isSending/isSubmitting 独立 loading 状态
├── stores/                      # Pinia 状态管理
│   │   └── auth.js                  # 认证 Store：token、user、isLoggedIn、login、fetchProfile、logout
│   ├── utils/                       # 前端工具函数
│   │   └── storage.js               # localStorage 封装：getToken/setToken/removeToken + 通用 get/set/remove
│   ├── styles/                      # 全局样式
│   │   ├── index.css                # 全局样式入口：Tailwind CSS + 暗黑模式 class 策略 + tokens 导入
│   │   └── tokens.css               # 主题 CSS 变量：:root 和 .dark 两套变量 + prefers-color-scheme fallback
│   ├── App.vue                      # 根组件（根据登录状态切换 LoginPage 和主页，含暗黑模式切换按钮）
│   └── main.js                      # 入口文件（createApp + Pinia + 挂载）
├── docs/                            # 文档
│   └── 前端暗黑模式规范手册.md        # 暗黑模式开发规范：技术架构、颜色映射表、Checklist、FAQ
├── index.html                       # HTML 入口（lang=zh-CN）
├── vite.config.js                   # Vite 配置（dev port: 30000，proxy /api → 8888，Tailwind 插件）
├── package.json                     # 项目依赖与脚本配置
├── package-lock.json                # 依赖锁定文件
├── start.ps1                        # 前端快速启动脚本（检查端口 30000 → 安装依赖 → dev server）
├── FILE.md                          # 本文件（项目文件索引）
└── 开发日志.md                       # 开发日志
```

## 文件说明

| 文件名 | 用途 | 最后修改 |
|--------|------|----------|
| `index.html` | HTML 入口文件，Vue 应用挂载点，lang=zh-CN，标题"金茂教材处理系统" | 2026-07-05 |
| `vite.config.js` | Vite 构建配置：端口 30000、/api 代理到 localhost:8888、@vitejs/plugin-vue、@tailwindcss/vite、Element Plus 按需自动导入 | 2026-07-06 |
| `package.json` | 定义项目名（web）、依赖（vue、axios、pinia、tailwindcss、element-plus）、启动脚本 | 2026-07-06 |
| `start.ps1` | PowerShell 快速启动脚本，检查端口 30000 占用并自动停止 → 检查依赖 → 启动 Vite dev server | 2026-07-05 |
| `src/main.js` | Vue 应用入口：createApp → 安装 Pinia → 导入样式 + Element Plus 暗黑 CSS → 挂载 #app | 2026-07-06 |
| `src/App.vue` | 根组件，根据 isLoggedIn 状态切换 LoginPage 和主页，包含登出功能，暗黑模式切换按钮 | 2026-07-06 |
| `src/composables/useTheme.js` | 主题切换 Composable：封装 VueUse useDark，导出 isDark 和 toggleTheme | 2026-07-06 |
| `src/pages/login/index.vue` | 登录注册页面（美化版）：背景光晕、Logo区、卡片装饰条、输入框图标、入场动画、响应式布局 | 2026-07-06 |
| `src/pages/login/script.js` | 登录注册页面逻辑：export default { setup() }，含完整 JSDoc 注释 | 2026-07-06 |
| `src/styles/index.css` | 全局样式入口：导入 Tailwind CSS，配置暗黑模式 class 策略，导入 tokens.css | 2026-07-06 |
| `src/styles/tokens.css` | 主题 CSS 变量：定义 :root 和 .dark 两套变量 + prefers-color-scheme fallback | 2026-07-06 |
| `src/api/client.js` | Axios 实例封装：baseURL=/api/v1、请求拦截器自动注入 Bearer Token、响应拦截器 401 自动清除 Token 跳登录 | 2026-07-05 |
| `src/api/auth.js` | 认证 API：sendCode（发送验证码）、login（验证码登录）、getProfile（获取用户信息）、updateProfile（更新用户信息） | 2026-07-05 |
| `src/api/books.js` | 教材 API：uploadBook（文件上传 multipart/form-data 10分钟超时）、listBooks（列表）、getBookDetail（详情）、getBookStatus（流水线状态） | 2026-07-05 |
| `src/stores/auth.js` | Pinia auth Store（Composition API 风格）：token/user 状态、isLoggedIn 计算属性、login/fetchProfile/logout 方法 | 2026-07-05 |
| `src/utils/storage.js` | localStorage 封装：KEYS 常量（TOKEN）、getToken/setToken/removeToken、通用 get/set/remove | 2026-07-05 |
| `docs/前端暗黑模式规范手册.md` | 暗黑模式开发规范：技术架构、颜色映射表、新增页面 Checklist、FAQ | 2026-07-06 |

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Vue 3 | ^3.5 |
| 构建 | Vite | ^8.1 |
| 样式 | Tailwind CSS | ^4 |
| HTTP | Axios | latest |
| 状态管理 | Pinia | latest |
| 工具库 | @vueuse/core | ^13 |
