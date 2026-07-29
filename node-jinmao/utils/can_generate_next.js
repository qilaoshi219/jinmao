// ==================== 统一计算"是否可以生成下一章"工具模块 ====================
// 职责：根据课程状态和章节列表，统一计算是否允许继续生成新章节
// 单一真相来源（Single Source of Truth）：前后端均调用此函数，避免判断逻辑不一致
//
// 输入：
//   course   — 课程对象（含 pipelineStatus、pipelineProgress 字段）
//   chapters — 章节数组（含 status 字段）
//
// 输出：{ can: boolean, reason: string }
//   can=true   — 可以生成下一章
//   can=false  — 不允许，reason 描述原因（用于调试日志和 API 错误消息）

// ==================== 日志前缀 ====================
const TAG = "[can_generate_next]";

/**
 * 统一计算是否可以生成下一章
 *
 * 判断优先级（从高到低，命中即返回）：
 *   1. 课程 pipelineStatus === "completed" → 课程整体已完成
 *   2. pipelineProgress.isLastChapter === true → 已标记为最后一章
 *   3. 存在 status === "generating" 的章节 → 有章节正在生成中
 *   4. 存在至少一个 completed 或 partial_completed 的章节 → 可以继续生成
 *   5. 以上都不满足 → 尚未完成任何章节，不可生成
 *
 * @param {Object} course - 课程对象（含 pipelineStatus 字符串 和 pipelineProgress JSON字符串/对象）
 * @param {Array<{status: string}>} chapters - 章节数组
 * @returns {{ can: boolean, reason: string }}
 */
function computeCanGenerateNext(course, chapters) {
    // ========== 1. 课程整体已完成 ==========
    if (course.pipelineStatus === "completed") {
        console.log(TAG + " 不允许：课程已完成（pipelineStatus=completed）");
        return { can: false, reason: "课程已完成" };
    }

    // ========== 2. 已标记最后一章 ==========
    // pipelineProgress 可能是 JSON 字符串（从数据库读出）或已解析对象
    let progress = course.pipelineProgress;
    if (typeof progress === "string") {
        try {
            progress = JSON.parse(progress);
        } catch (_) {
            progress = null;
        }
    }
    if (progress && progress.isLastChapter === true) {
        console.log(TAG + " 不允许：已是最后一章（pipelineProgress.isLastChapter=true）");
        return { can: false, reason: "已是最后一章" };
    }

    // ========== 3. 有章节正在生成中 ==========
    const chaptersList = chapters || [];
    const hasGenerating = chaptersList.some(c => c.status === "generating");
    if (hasGenerating) {
        console.log(TAG + " 不允许：有章节正在生成中");
        return { can: false, reason: "有章节正在生成中" };
    }

    // ========== 4. 至少有一个已完成/部分完成的章节 ==========
    const hasCompleted = chaptersList.some(c =>
        c.status === "completed" || c.status === "partial_completed"
    );
    if (hasCompleted) {
        console.log(TAG + " 允许：存在已完成章节，可继续生成");
        return { can: true, reason: "" };
    }

    // ========== 5. 以上都不满足 ==========
    console.log(TAG + " 不允许：尚未完成任何章节");
    return { can: false, reason: "尚未完成任何章节" };
}

// ==================== 模块导出 ====================
module.exports = { computeCanGenerateNext };
