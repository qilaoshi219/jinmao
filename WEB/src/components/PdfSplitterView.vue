<!--
============================================================================
文件名：PdfSplitterView.vue
文件作用：PDF 分割器——浏览器端上传 PDF，按多个页码范围（如 1-10, 15-20）
         一次拆分生成多个独立 PDF；左侧为操作区，右侧为 PDF 页缩略图预览
         （全部在浏览器完成，无后端调用；pdf-lib 负责拆分，pdfjs-dist 负责预览）
         拆分完成后不自动下载，由用户点击各文件的"下载"按钮手动保存
设计规范：纯黑纯白文字、10px 圆角、500ms 过渡、Element Plus 优先、暗黑双轨适配
============================================================================
-->

<template>
  <div class="flex flex-col gap-4 lg:flex-row lg:items-start">
    <!-- ==================== 左侧：操作区 ==================== -->
    <div class="w-full lg:w-[400px] lg:flex-shrink-0 flex flex-col gap-4">
      <!-- ===== 工具头部说明 ===== -->
      <div class="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-card)] p-4
                  transition-colors duration-500">
        <h3 class="text-[15px] font-bold text-black dark:text-white transition-colors duration-500">
          PDF 分割器
        </h3>
        <p class="text-[13px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed
                  transition-colors duration-500">
          上传 PDF 后输入页码范围（支持多个区间，如 <span class="font-mono">1-10, 15-20</span>），
          每个区间生成一个独立 PDF，确认无误后点击下载。文件仅在浏览器本地处理。
        </p>
      </div>

      <!-- ===== 上传区 ===== -->
      <div
        v-if="!pdfDoc && !splitting"
        class="rounded-[10px] border border-dashed border-[var(--color-border)]
               bg-[var(--color-card)] p-6 text-center cursor-pointer
               hover:border-blue-500 dark:hover:border-blue-400
               transition-all duration-500"
        @click="triggerUpload"
        @dragover.prevent
        @drop.prevent="onDrop"
      >
        <svg class="w-10 h-10 mx-auto text-blue-500 dark:text-blue-400 transition-colors duration-500"
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p class="mt-2 text-sm text-black dark:text-white font-medium transition-colors duration-500">
          点击选择或拖拽 PDF 文件到此处
        </p>
        <p class="mt-1 text-xs text-gray-400 dark:text-gray-500 transition-colors duration-500">
          仅支持 PDF 格式，最大 100MB
        </p>
        <input
          ref="fileInputRef"
          type="file"
          accept=".pdf,application/pdf"
          class="hidden"
          @change="onFileInputChange"
        />
      </div>

      <!-- ===== 文件信息 + 页码输入 + 操作 ===== -->
      <div v-else class="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-card)] p-4
                         transition-colors duration-500">
        <!-- 文件信息行 -->
        <div class="flex items-center gap-3 pb-3 border-b transition-colors duration-500"
             :style="{ borderColor: 'var(--color-border)' }">
          <div class="w-9 h-9 rounded-[10px] bg-red-50 dark:bg-red-900/20 flex items-center justify-center
                      flex-shrink-0 transition-colors duration-500">
            <svg class="w-[18px] h-[18px] text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
            </svg>
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-medium text-black dark:text-white truncate transition-colors duration-500">
              {{ fileName }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 transition-colors duration-500">
              共 {{ totalPages }} 页 · {{ formattedSize }}
            </p>
          </div>
          <el-button size="small" text :disabled="splitting" @click="resetFile">重新选择</el-button>
        </div>

        <!-- 页码输入 -->
        <div class="mt-4">
          <label class="block text-[13px] font-medium text-black dark:text-white mb-1.5
                        transition-colors duration-500">
            页码范围
          </label>
          <el-input
            v-model="rangesInput"
            placeholder="例如：1-10, 15-20 或 3"
            :disabled="splitting"
            clearable
            @keyup.enter="handleSplit"
          />
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1.5 transition-colors duration-500">
            逗号分隔多个区间，每段支持「起-止」或单个页码，最多 {{ MAX_RANGES }} 个区间
          </p>
        </div>

        <!-- 操作按钮 -->
        <div class="mt-4 flex items-center gap-3">
          <el-button type="primary" :loading="splitting" @click="handleSplit">
            {{ splitting ? '拆分中...' : '开始拆分' }}
          </el-button>
          <el-button v-if="splitting" text disabled>
            正在生成 {{ splitResults.length }} / {{ rangeCount }} 个文件...
          </el-button>
        </div>

        <!-- 拆分结果列表（手动下载） -->
        <div v-if="splitResults.length > 0" class="mt-4 space-y-2">
          <div class="text-[13px] font-semibold text-black dark:text-white transition-colors duration-500">
            拆分结果（{{ splitResults.length }} 个文件）
          </div>
          <div
            v-for="(item, idx) in splitResults"
            :key="idx"
            class="flex items-center gap-2 px-3 py-2 rounded-[10px] text-[13px]
                   bg-green-50 dark:bg-green-900/10 transition-colors duration-500"
          >
            <span class="text-green-500 dark:text-green-400 flex-shrink-0">✓</span>
            <span class="flex-1 min-w-0">
              <span class="block truncate text-black dark:text-white transition-colors duration-500">
                {{ item.name }}
              </span>
              <span class="block text-xs text-gray-500 dark:text-gray-400 transition-colors duration-500">
                {{ item.pageCount }} 页 · {{ item.size }}
              </span>
            </span>
            <el-button size="small" type="success" plain @click="downloadResult(item)">
              下载
            </el-button>
          </div>
          <p class="text-xs text-gray-400 dark:text-gray-500 transition-colors duration-500">
            拆分文件暂存于浏览器内存中，请及时下载保存
          </p>
        </div>
      </div>
    </div>

    <!-- ==================== 右侧：PDF 预览区 ==================== -->
    <div class="flex-1 min-w-0 rounded-[10px] border border-[var(--color-border)]
                bg-[var(--color-card)] transition-colors duration-500 overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 border-b transition-colors duration-500"
           :style="{ borderColor: 'var(--color-border)' }">
        <h3 class="text-[13px] font-semibold text-black dark:text-white transition-colors duration-500">
          PDF 预览
        </h3>
        <span v-if="pdfDoc" class="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-500">
          {{ renderedCount }} / {{ totalPages }} 页已渲染
        </span>
      </div>

      <!-- 未上传文件时的占位提示 -->
      <div
        v-if="!pdfDoc"
        class="flex flex-col items-center justify-center py-24 text-center
               transition-colors duration-500"
      >
        <svg class="w-12 h-12 text-slate-300 dark:text-slate-600 transition-colors duration-500"
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2"
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
        </svg>
        <p class="mt-3 text-sm text-gray-500 dark:text-gray-400 transition-colors duration-500">
          上传 PDF 后，这里将显示每一页的缩略图预览
        </p>
      </div>

      <!-- 缩略图网格 -->
      <div v-else class="p-4 overflow-auto max-h-[calc(100vh-240px)]">
        <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          <div
            v-for="n in totalPages"
            :key="n"
            class="rounded-[10px] border border-[var(--color-border)] p-2
                   bg-[var(--color-bg-primary)] transition-colors duration-500"
          >
            <div class="relative bg-white rounded overflow-hidden">
              <canvas
                :ref="(el) => setThumbRef(el, n)"
                class="w-full h-auto block"
              />
              <div
                v-if="renderedCount < n"
                class="absolute inset-0 flex items-center justify-center
                       bg-gray-100 dark:bg-gray-800/60 transition-colors duration-500"
              >
                <el-icon class="is-loading" :size="16"><Loading /></el-icon>
              </div>
            </div>
            <p class="mt-1.5 text-center text-xs text-gray-500 dark:text-gray-400
                      transition-colors duration-500">
              第 {{ n }} 页
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// ==================== PdfSplitterView 逻辑 ====================
// 职责：管理 PDF 文件选择、页数读取、页码范围解析与校验、拆分
//       右侧用 pdfjs-dist 渲染页面缩略图供用户预览

import { ref, computed, onUnmounted } from "vue";
import { ElMessage } from "element-plus";
import { Loading } from "@element-plus/icons-vue";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";

// pdfjs worker 配置（与 UploadBookDialog 一致，Vite 构建时复制 worker 文件）
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

// 日志前缀
const TAG = "[PdfSplitterView]";

/** 文件大小上限（100MB） */
const MAX_FILE_SIZE = 100 * 1024 * 1024;

/** 最大允许的区间数量 */
const MAX_RANGES = 20;

/** 缩略图目标宽度（px，渲染时按 devicePixelRatio 放大保证清晰） */
const THUMB_WIDTH = 180;

// ========== 响应式状态 ==========
/** 原生文件输入框 ref */
const fileInputRef = ref(null);

/** 已加载的 PDF 文档（pdf-lib 实例，用于拆分） */
const pdfDoc = ref(null);

/** 原始文件名（不含扩展名） */
const baseName = ref("");

/** 完整文件名 */
const fileName = ref("");

/** 总页数 */
const totalPages = ref(0);

/** 原始文件大小（字节） */
const fileSize = ref(0);

/** 页码范围输入文本 */
const rangesInput = ref("");

/** 拆分中标识 */
const splitting = ref(false);

/** 拆分结果列表（内存中保存 Blob，等待用户点击下载） */
const splitResults = ref([]);

/** 当前拆分任务的区间总数 */
const rangeCount = ref(0);

/** 已渲染缩略图的页数（用于进度提示） */
const renderedCount = ref(0);

// ========== 非响应式内部状态 ==========
/** 原始文件 ArrayBuffer（pdfjs 预览用） */
let fileArrayBuffer = null;

/** pdfjs PDF 文档实例（预览用） */
let pdfjsDoc = null;

/** 缩略图 canvas 元素映射表（key: 1 基页码, value: canvas） */
const thumbCanvases = {};

/** 渲染中断标识（切换文件/卸载时置 true） */
let renderCancelled = false;

// ========== 计算属性 ==========

/** 格式化文件大小（B / KB / MB） */
const formattedSize = computed(() => formatBytes(fileSize.value));

/**
 * 格式化字节数为可读字符串
 * @param {number} bytes - 字节数
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

// ========== 文件选择与加载 ==========

/**
 * 点击上传区触发原生文件选择
 */
function triggerUpload() {
  fileInputRef.value?.click();
}

/**
 * 拖拽释放文件
 * @param {DragEvent} event
 */
function onDrop(event) {
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    loadFile(file);
  }
}

/**
 * 原生文件输入 change 事件
 * @param {Event} event
 */
function onFileInputChange(event) {
  const file = event.target.files?.[0];
  if (file) {
    loadFile(file);
  }
  // 清空 input 值，允许重复选择同一文件
  event.target.value = "";
}

/**
 * 校验并加载 PDF 文件
 * @param {File} file
 */
async function loadFile(file) {
  // 扩展名校验
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext !== "pdf" && file.type !== "application/pdf") {
    ElMessage.error("仅支持 PDF 格式的文件");
    return;
  }

  // 大小校验
  if (file.size > MAX_FILE_SIZE) {
    ElMessage.error("文件过大，最大支持 100MB");
    return;
  }

  try {
    // 先解析原始二进制（pdf-lib 负责拆分，pdfjs-dist 负责预览）
    const arrayBuffer = await file.arrayBuffer();
    const doc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

    // 释放上一个文件的所有资源
    disposePrevious();

    pdfDoc.value = doc;
    fileArrayBuffer = arrayBuffer;
    baseName.value = file.name.replace(/\.pdf$/i, "") || "pdf";
    fileName.value = file.name;
    totalPages.value = doc.getPageCount();
    fileSize.value = file.size;
    rangesInput.value = "";
    splitResults.value = [];
    rangeCount.value = 0;
    renderedCount.value = 0;

    console.log(TAG + " PDF 加载成功: " + fileName.value + "，共 " + totalPages.value + " 页");

    // 渲染右侧缩略图预览
    await renderPreview();
  } catch (error) {
    console.error(TAG + " PDF 解析失败:", error);
    ElMessage.error("PDF 文件解析失败，请确认文件未损坏");
  }
}

/**
 * 重置已选文件，回到上传区
 */
function resetFile() {
  disposePrevious();
  pdfDoc.value = null;
  fileArrayBuffer = null;
  baseName.value = "";
  fileName.value = "";
  totalPages.value = 0;
  fileSize.value = 0;
  rangesInput.value = "";
  splitResults.value = [];
  rangeCount.value = 0;
  renderedCount.value = 0;
  splitting.value = false;
}

/**
 * 释放上一个 PDF 的预览与拆分资源
 */
function disposePrevious() {
  renderCancelled = true;
  if (pdfjsDoc) {
    try {
      pdfjsDoc.destroy();
    } catch (_) {
      // 销毁失败静默处理
    }
    pdfjsDoc = null;
  }
  Object.keys(thumbCanvases).forEach((key) => {
    delete thumbCanvases[key];
  });
}

/**
 * 记录缩略图 canvas 元素（函数式 ref，按 1 基页码索引）
 * @param {HTMLElement|null} el
 * @param {number} pageNo
 */
function setThumbRef(el, pageNo) {
  if (el) {
    thumbCanvases[pageNo] = el;
  }
}

// ========== PDF 预览渲染（pdfjs-dist） ==========

/**
 * 用 pdfjs-dist 加载文件并逐页渲染缩略图
 */
async function renderPreview() {
  if (!fileArrayBuffer) return;

  renderCancelled = false;

  try {
    // 从 ArrayBuffer 复制一份，避免与 pdf-lib 共享同一缓冲导致释放冲突
    const data = new Uint8Array(fileArrayBuffer.slice(0));
    const loadingTask = pdfjsLib.getDocument({
      data,
      disableAutoFetch: true,
      disableStream: true,
    });
    pdfjsDoc = await loadingTask.promise;

    if (renderCancelled) return;

    // 逐页渲染，避免一次性渲染大量页面导致卡顿
    for (let pageNo = 1; pageNo <= totalPages.value; pageNo++) {
      if (renderCancelled) return;

      const canvas = thumbCanvases[pageNo];
      if (!canvas) continue;

      try {
        await renderThumbnail(pageNo, canvas);
        if (renderCancelled) return;
        renderedCount.value = pageNo;
      } catch (error) {
        console.warn(TAG + " 第 " + pageNo + " 页缩略图渲染失败:", error);
        renderedCount.value = pageNo;
      }
    }
  } catch (error) {
    console.error(TAG + " pdfjs 加载失败:", error);
    ElMessage.error("PDF 预览加载失败");
  }
}

/**
 * 渲染单页缩略图到指定 canvas
 * @param {number} pageNo - 1 基页码
 * @param {HTMLCanvasElement} canvas - 目标 canvas
 */
async function renderThumbnail(pageNo, canvas) {
  const page = await pdfjsDoc.getPage(pageNo);
  if (renderCancelled) return;

  // 按目标宽度等比计算渲染尺寸（乘 dpr 保证高清屏清晰）
  const dpr = window.devicePixelRatio || 1;
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = (THUMB_WIDTH * dpr) / baseViewport.width;
  const viewport = page.getViewport({ scale });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const ctx = canvas.getContext("2d");
  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise;
}

// ========== 页码范围解析与拆分 ==========

/**
 * 解析用户输入的页码范围文本
 * 支持逗号分隔的多个区间："1-10"、"3"、"1,3-5,8"
 * @param {string} text - 原始输入
 * @returns {{ from: number, to: number }[] | null} 区间数组，解析失败返回 null
 */
function parseRanges(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    ElMessage.warning("请输入页码范围");
    return null;
  }

  const parts = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    ElMessage.warning("请输入页码范围");
    return null;
  }
  if (parts.length > MAX_RANGES) {
    ElMessage.warning("页码范围过多，最多支持 " + MAX_RANGES + " 个区间");
    return null;
  }

  const ranges = [];

  for (const part of parts) {
    // 单页：纯数字
    if (/^\d+$/.test(part)) {
      const page = parseInt(part, 10);
      if (page < 1 || page > totalPages.value) {
        ElMessage.warning("页码超出范围（1-" + totalPages.value + "）: " + part);
        return null;
      }
      ranges.push({ from: page, to: page });
      continue;
    }

    // 区间：数字-数字
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (!rangeMatch) {
      ElMessage.warning("页码范围格式不正确: " + part + "（示例：1-10）");
      return null;
    }

    const from = parseInt(rangeMatch[1], 10);
    const to = parseInt(rangeMatch[2], 10);
    if (from < 1 || to > totalPages.value) {
      ElMessage.warning("页码超出范围（1-" + totalPages.value + "）: " + part);
      return null;
    }
    if (from > to) {
      ElMessage.warning("起始页码不能大于结束页码: " + part);
      return null;
    }
    ranges.push({ from, to });
  }

  return ranges;
}

/**
 * 生成拆分文件名
 * 单页：原文件名_第3页.pdf；区间：原文件名_第1-10页.pdf
 * @param {number} from - 起始页
 * @param {number} to - 结束页
 * @returns {string}
 */
function buildOutputName(from, to) {
  if (from === to) {
    return baseName.value + "_第" + from + "页.pdf";
  }
  return baseName.value + "_第" + from + "-" + to + "页.pdf";
}

/**
 * 触发单个 Blob 的浏览器下载（用户点击下载按钮时调用）
 * @param {Blob} blob - 文件内容
 * @param {string} name - 文件名
 */
function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 延迟释放，确保下载已开始
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 点击下载按钮：下载单个拆分结果
 * @param {{ blob: Blob, name: string }} item - 拆分结果项
 */
function downloadResult(item) {
  if (!item.blob) {
    ElMessage.warning("文件内容已失效，请重新拆分");
    return;
  }
  console.log(TAG + " 用户点击下载: " + item.name);
  triggerDownload(item.blob, item.name);
}

/**
 * 执行拆分：按每个区间生成独立 PDF 并暂存内存，等待用户手动下载
 */
async function handleSplit() {
  if (!pdfDoc.value) {
    ElMessage.warning("请先上传 PDF 文件");
    return;
  }
  if (splitting.value) return;

  const ranges = parseRanges(rangesInput.value);
  if (!ranges) return;

  splitting.value = true;
  splitResults.value = [];
  rangeCount.value = ranges.length;

  console.log(TAG + " 开始拆分，区间: " + JSON.stringify(ranges));

  try {
    for (const { from, to } of ranges) {
      const pageIndices = indicesInRange(from, to);

      // 生成该区间的新文档并复制页面
      const newDoc = await PDFDocument.create();
      const copiedPages = await newDoc.copyPages(pdfDoc.value, pageIndices);
      copiedPages.forEach((page) => newDoc.addPage(page));

      const bytes = await newDoc.save();
      const outputName = buildOutputName(from, to);
      const blob = new Blob([bytes], { type: "application/pdf" });

      splitResults.value.push({
        name: outputName,
        blob,
        pageCount: to - from + 1,
        size: formatBytes(bytes.length),
      });

      console.log(TAG + " 已生成: " + outputName + "（" + (to - from + 1) + " 页）");
    }

    ElMessage.success("拆分完成，共生成 " + ranges.length + " 个文件，请点击下载保存");
  } catch (error) {
    console.error(TAG + " 拆分失败:", error);
    ElMessage.error("拆分失败: " + (error.message || "未知错误"));
  } finally {
    splitting.value = false;
  }
}

/**
 * 生成 [from, to] 的零基页码索引数组（pdf-lib copyPages 使用零基索引）
 * @param {number} from - 起始页（1 基）
 * @param {number} to - 结束页（1 基）
 * @returns {number[]}
 */
function indicesInRange(from, to) {
  const indices = [];
  for (let i = from; i <= to; i++) {
    indices.push(i - 1);
  }
  return indices;
}

// ========== 生命周期 ==========
onUnmounted(() => {
  // 页面离开时释放 pdfjs 资源
  renderCancelled = true;
  if (pdfjsDoc) {
    try {
      pdfjsDoc.destroy();
    } catch (_) {
      // 静默处理
    }
    pdfjsDoc = null;
  }
});
</script>
