<!--
============================================================================
文件名：study/NotesDialog.vue（课程笔记弹窗）
文件作用：查看/新增/编辑/删除当前章节-页码的笔记，支持标记色
遵守设计规范：Element Plus、10px 圆角、纯黑纯白文字、暗黑双轨、防重复点击
============================================================================
-->

<template>
  <el-dialog
    :model-value="visible"
    :title="'笔记 · ' + (chapterName || '')"
    width="min(560px, 92vw)"
    top="6vh"
    :close-on-click-modal="false"
    @update:model-value="(v) => $emit('update:visible', v)"
    @open="loadNotes">

    <!-- 加载中 -->
    <div v-if="loading" class="flex items-center justify-center py-10">
      <el-icon class="is-loading" :size="26"><Loading /></el-icon>
    </div>

    <template v-else>
      <!-- 当前页提示 -->
      <p class="text-xs text-gray-400 dark:text-gray-500 mb-3">
        当前页：第 {{ pageNumber }} 页
      </p>

      <!-- 笔记列表 -->
      <div v-if="notes.length > 0" class="flex flex-col gap-2 mb-4">
        <div v-for="n in notes" :key="n.id"
             class="rounded-[10px] border p-3 transition-colors duration-500"
             :style="{ backgroundColor: colorBg(n.color), borderColor: colorBorder(n.color) }">
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <span class="text-[11px] font-medium" :class="colorText(n.color)">
              第 {{ n.pageNumber }} 页 · {{ timeText(n.updateTime) }}
            </span>
            <div class="flex items-center gap-1">
              <el-button size="small" text type="primary" @click="startEdit(n)">编辑</el-button>
              <el-button size="small" text type="danger" :loading="deletingId === n.id" @click="remove(n)">
                删除
              </el-button>
            </div>
          </div>
          <p class="text-sm text-black dark:text-white whitespace-pre-wrap leading-relaxed">
            {{ n.content }}
          </p>
        </div>
      </div>

      <p v-else class="text-center text-xs text-gray-400 dark:text-gray-500 py-6 mb-2">
        当前页还没有笔记，写一条吧
      </p>

      <!-- 新增/编辑表单 -->
      <div class="rounded-[10px] border p-3 transition-colors duration-500"
           :style="{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">标记色：</span>
          <button
            v-for="c in colorOptions"
            :key="c.value"
            class="w-5 h-5 rounded-full transition-all duration-500 border"
            :style="{ backgroundColor: colorBg(c.value), borderColor: editingId ? colorBorder(c.value) : colorBorder(c.value) }"
            :class="form.color === c.value ? 'ring-2 ring-blue-500 dark:ring-blue-400 scale-110' : ''"
            @click="form.color = c.value"></button>
        </div>
        <el-input
          v-model="form.content"
          type="textarea"
          :rows="3"
          maxlength="5000"
          show-word-limit
          placeholder="记录这一页的重点、疑问或想法..."
        />
        <div class="flex justify-end gap-2 mt-2">
          <el-button v-if="editingId" size="small" @click="cancelEdit">取消</el-button>
          <el-button size="small" type="primary" :loading="saving" :disabled="!form.content.trim()" @click="save">
            {{ saving ? '保存中...' : editingId ? '保存修改' : '添加笔记' }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
// ==================== 课程笔记弹窗逻辑 ====================
import { ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { getCourseNotes, createNote, updateNote, deleteNote } from "../../api/books";

const props = defineProps({
  visible: { type: Boolean, default: false },
  courseId: { type: [String, Number], default: null },
  chapterId: { type: [String, Number], default: null },
  chapterName: { type: String, default: "" },
  pageNumber: { type: Number, default: 1 },
});
const emit = defineEmits(["update:visible"]);

const colorOptions = [
  { value: "yellow", label: "黄" },
  { value: "green", label: "绿" },
  { value: "blue", label: "蓝" },
  { value: "pink", label: "粉" },
];

const loading = ref(false);
const saving = ref(false);
const deletingId = ref(null);
const notes = ref([]);
const editingId = ref(null);
const form = ref({ color: "yellow", content: "" });

function colorBg(color) {
  const map = {
    yellow: "#fef9c3",
    green: "#dcfce7",
    blue: "#dbeafe",
    pink: "#fce7f3",
  };
  return map[color] || map.yellow;
}

function colorBorder(color) {
  const map = {
    yellow: "#fde68a",
    green: "#86efac",
    blue: "#93c5fd",
    pink: "#f9a8d4",
  };
  return map[color] || map.yellow;
}

function colorText(color) {
  const map = { yellow: "text-amber-600", green: "text-green-600", blue: "text-blue-600", pink: "text-pink-600" };
  return map[color] || "text-amber-600";
}

function timeText(t) {
  if (!t) return "";
  const d = new Date(t);
  return d.getMonth() + 1 + "月" + d.getDate() + "日 " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

async function loadNotes() {
  if (!props.courseId) return;
  loading.value = true;
  try {
    const result = await getCourseNotes(props.courseId, { chapterId: props.chapterId, page: props.pageNumber });
    if (result.code === 200) {
      notes.value = result.data || [];
    }
  } catch (error) {
    console.error("笔记加载失败:", error);
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!form.value.content.trim() || saving.value) return;
  saving.value = true;
  try {
    if (editingId.value) {
      const result = await updateNote(editingId.value, { content: form.value.content, color: form.value.color });
      if (result.code !== 200) return ElMessage.error(result.message || "保存失败");
    } else {
      const result = await createNote(props.courseId, props.chapterId, {
        page: props.pageNumber,
        color: form.value.color,
        content: form.value.content,
      });
      if (result.code !== 200) return ElMessage.error(result.message || "保存失败");
    }
    ElMessage.success("笔记已保存");
    resetForm();
    loadNotes();
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || "保存失败");
  } finally {
    saving.value = false;
  }
}

function startEdit(n) {
  editingId.value = n.id;
  form.value = { color: n.color, content: n.content };
}

function cancelEdit() {
  resetForm();
}

function resetForm() {
  editingId.value = null;
  form.value = { color: "yellow", content: "" };
}

async function remove(n) {
  deletingId.value = n.id;
  try {
    const result = await deleteNote(n.id);
    if (result.code === 200) {
      ElMessage.success("笔记已删除");
      loadNotes();
    } else {
      ElMessage.error(result.message || "删除失败");
    }
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || "删除失败");
  } finally {
    deletingId.value = null;
  }
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      resetForm();
      loadNotes();
    }
  }
);
</script>
