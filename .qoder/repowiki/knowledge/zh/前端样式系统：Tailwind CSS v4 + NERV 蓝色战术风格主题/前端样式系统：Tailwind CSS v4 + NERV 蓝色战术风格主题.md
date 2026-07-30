---
kind: frontend_style
name: 前端样式系统：Tailwind CSS v4 + NERV 蓝色战术风格主题
category: frontend_style
scope:
    - '**'
source_files:
    - WEB/src/styles/index.css
    - WEB/src/styles/tokens.css
    - WEB/src/composables/useTheme.js
    - WEB/vite.config.js
    - WEB/package.json
    - WEB/docs/前端暗黑模式规范手册.md
    - jinmao-nerv-redesign/colors_and_type.css
---

## 1. 系统与工具栈
- 样式引擎：Tailwind CSS v4（通过 `@tailwindcss/vite` 插件集成），采用原子化 class 策略，使用 `dark:` 变体实现暗黑模式。
- UI 组件库：Element Plus（配合 `unplugin-vue-components` 和 `unplugin-auto-import` 实现按需自动导入，无需手动 import 组件与 API）。
- 构建工具：Vite（开发端口 30000，`/api` 请求代理到后端 Express 8888）。
- 主题状态管理：VueUse `useDark` + `useToggle`，封装为 `src/composables/useTheme.js`，自动处理 `html.dark` class、localStorage 持久化与系统偏好跟随。
- 设计令牌：CSS 自定义变量集中定义在 `src/styles/tokens.css`，提供亮色/暗黑两套变量，用于 Tailwind 无法覆盖的全局场景（body 背景、阴影等）。

## 2. 核心文件与位置
- `WEB/src/styles/index.css` — 全局样式入口，引入 Tailwind v4、配置 `@custom-variant dark`、导入 tokens.css，并定义 NERV 战术装饰类（`.nerv-brackets`、`.nerv-grid-bg`、`.nerv-rail`、`.no-scrollbar`）。
- `WEB/src/styles/tokens.css` — 定义 `:root` 与 `.dark` 两套 CSS 变量（`--color-bg-primary`、`--color-text-primary`、`--color-card`、`--color-border`、`--color-rail`、`--shadow-card` 等），以及 `prefers-color-scheme` fallback 和全局颜色过渡动画。
- `WEB/src/composables/useTheme.js` — 封装 VueUse 的 `useDark`，导出 `{ isDark, toggleTheme }`，默认存储键名为 `app-theme`。
- `jinmao-nerv-redesign/colors_and_type.css` — NERV 蓝色战术风格的独立设计令牌文件，定义 `--nerv-*` 系列变量（primary、muted、border、radius、state colors、rail、grid、scanline），作为视觉规范参考。
- `WEB/docs/前端暗黑模式规范手册.md` — 完整的暗黑模式开发规范文档，规定每行颜色必须配 `dark:` 对应、颜色映射表、阴影处理、图标适配、过渡动画及新增页面 Checklist。
- `WEB/vite.config.js` — Vite 配置，启用 `@tailwindcss/vite`、Element Plus 按需自动导入、开发代理与构建输出目录。
- `WEB/package.json` — 依赖声明：vue 3、tailwindcss 4、element-plus、pinia、axios、@vueuse/core 等。

## 3. 架构与设计约定
- **三层主题架构**：
  - 第3层：VueUse `useDark` 管理响应式 `isDark` 状态，操作 `<html>` 元素的 `dark` class。
  - 第2层：Tailwind CSS v4 的 `dark:` 变体检测 `html.dark`，所有组件统一通过 `dark:` 前缀切换颜色。
  - 第1层：CSS 自定义变量在 `:root` 与 `.dark` 下分别定义，作为 Tailwind 覆盖不到的兜底层，同时提供 `prefers-color-scheme` 媒体查询作为 JS 不可用时的 fallback。
- **NERV 蓝色战术风格**：以蓝色为主色调（`#409EFF` / `#3488ea`），搭配冷白/深蓝黑背景，强调锐利几何（小圆角 2-6px）、左侧蓝色状态轨指示器、淡蓝色网格背景等战术装饰元素。
- **组件级样式组织**：样式内联于 Vue SFC 中，使用 Tailwind 原子类；全局通用样式集中在 `index.css` 的 NERV 装饰类中。
- **无独立 tailwind.config.js**：Tailwind v4 使用 CSS 内 `@import "tailwindcss"` + `@custom-variant` 方式配置，未使用传统配置文件。

## 4. 约定与约束
- **强制规则（来自《前端暗黑模式规范手册》）**：
  - 任何包含颜色的 Tailwind 类必须同时写上 `dark:` 对应变体（如 `bg-white dark:bg-gray-800`），禁止只写亮色或只写暗色。
  - 所有可切换主题的组件根容器需添加 `transition-colors duration-300` 确保切换平滑。
  - SVG 图标颜色通过 `text-*` 类控制，而非内联 style。
  - 新增页面需在 Chrome DevTools 中手动切换 `.dark` 验证暗黑模式效果。
- **技术约束**：
  - 暗黑模式通过给 `<html>` 添加/移除 `dark` class 实现，非媒体查询策略。
  - 主题状态持久化到 localStorage，键名固定为 `app-theme`。
  - 首次访问自动跟随系统 `prefers-color-scheme` 偏好。
  - Element Plus 组件通过 unplugin 自动按需导入，无需手动注册。
- **设计约束（来自 NERV 设计规范）**：
  - 主色调使用蓝色系（blue-500/blue-400），文字遵循纯黑/纯白原则。
  - 卡片阴影在暗黑模式下减弱或移除，避免过深阴影。
  - 战术装饰（角括号、网格背景、状态轨）仅用于只读视觉增强，不影响组件功能。