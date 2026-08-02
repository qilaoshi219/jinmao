// ==================== 题库市场页面逻辑 ====================
// 职责：管理题库市场页面的所有响应式数据和方法
// 包括：市场列表加载、搜索、分页、借用/取消借用

import { ref } from "vue";
import { ElMessage } from "element-plus";
import { Search } from "@element-plus/icons-vue";
import { listMarketTextbooks, borrowTextbook } from "../../api/quiz";

// 日志前缀
const TAG = "[market_script]";

// ==================== 响应式数据 ====================

/** 市场题库列表数据 */
const marketList = ref([]);

/** 加载中标识 */
const loading = ref(false);

/** 搜索关键词 */
const searchKeyword = ref("");

/** 当前页码 */
const currentPage = ref(1);

/** 每页条数 */
const pageSize = ref(12);

/** 总数 */
const total = ref(0);

/** 正在借用中的题库ID（用于按钮 loading 状态） */
const borrowingId = ref(null);

// ==================== 方法 ====================

/**
 * 加载市场题库列表
 * 切换到该页面时由父组件调用
 */
async function loadMarketList() {
  console.log(TAG + " 加载题库市场列表");
  loading.value = true;

  try {
    const res = await listMarketTextbooks({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchKeyword.value || undefined,
    });

    if (res.code === 0 && res.data) {
      marketList.value = res.data.items || [];
      total.value = res.data.total || 0;
      console.log(TAG + " 市场列表加载成功 — " + total.value + " 条");
    } else {
      console.error(TAG + " 市场列表加载失败: " + (res.message || "未知错误"));
      ElMessage.error("加载题库市场失败");
    }
  } catch (error) {
    console.error(TAG + " 市场列表加载异常:", error);
    ElMessage.error("加载题库市场失败: " + (error.message || "网络错误"));
  } finally {
    loading.value = false;
  }
}

/**
 * 搜索题库（重置到第1页）
 */
function handleSearch() {
  console.log(TAG + " 搜索: " + (searchKeyword.value || "清除搜索"));
  currentPage.value = 1;
  loadMarketList();
}

/**
 * 页码变化
 * @param {number} page - 新页码
 */
function handlePageChange(page) {
  console.log(TAG + " 翻页: " + page);
  currentPage.value = page;
  loadMarketList();
}

/**
 * 借用题库
 * @param {Object} textbook - 题库对象
 */
async function handleBorrow(textbook) {
  console.log(TAG + " 借用题库: " + textbook.name + " (id: " + textbook.id + ")");

  borrowingId.value = textbook.id;

  try {
    const res = await borrowTextbook(textbook.id);

    if (res.code === 0) {
      ElMessage.success("题库借用成功！可在\"习题训练\"中开始刷题");
      // 更新列表中此项的借用状态
      const item = marketList.value.find((t) => t.id === textbook.id);
      if (item) {
        item.isBorrowed = true;
      }
    } else {
      ElMessage.error(res.message || "借用失败");
    }
  } catch (error) {
    console.error(TAG + " 借用题库异常:", error);
    ElMessage.error("借用失败: " + (error.message || "网络错误"));
  } finally {
    borrowingId.value = null;
  }
}

// ==================== 导出供 index.vue 使用 ====================

export default function useMarketScript() {
  return {
    // 状态
    marketList,
    loading,
    searchKeyword,
    currentPage,
    pageSize,
    total,
    borrowingId,
    // 图标
    Search,
    // 方法
    loadMarketList,
    handleBorrow,
    handleSearch,
    handlePageChange,
  };
}
