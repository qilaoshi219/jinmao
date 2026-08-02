// ==================== 统一计算"是否可以生成下一章"工具模块 ====================
// 职责：根据课程状态和章节列表，统一计算是否允许继续生成新章节
// 单一真相来源（Single Source of Truth）：前后端均调用此函数，避免判断逻辑不一致
//
// 输入：
//   course   — 课程对象（含 pipelineStatus、pipelineProgress、maxline、endline 字段）
//   chapters — 章节数组（含 status 字段）
//
// 输出：{ can: boolean, reason: string }
//   can=true   — 可以生成下一章
//   can=false  — 不允许，reason 描述原因（用于调试日志和 API 错误消息）
//
// 判断优先级（三级防御体系，numeric > flag）：
//   Level 1（权威）: maxline 数值校验
//     endline >= maxline 且 maxline > 0  → 全部已处理，不可生成
//     endline < maxline 且 maxline > 0   → 有剩余内容，可继续（即使 isLastChapter/pipelineStatus 误判也覆盖）
//   Level 2: 课程整体已完成（pipelineStatus === "completed"）→ 仅在 maxline=0 时生效
//   Level 3: 已标记最后一章（pipelineProgress.isLastChapter）→ 仅在 maxline=0 时生效
//   通用检查: 有章节正在生成中 / 无已完成章节

// ==================== 日志前缀 ====================
const TAG = "[can_generate_next]";

/**
 * 统一计算是否可以生成下一章
 *
 * 判断优先级（从高到低，命中即返回）：
 *   0. maxline 权威校验（numeric > flag）
 *      a. maxline > 0 且 endline >= maxline → 不可生成（全部内容已处理完毕）
 *      b. maxline > 0 且 endline < maxline  → 有剩余内容，跳过 pipelineStatus/isLastChapter 检查
 *   1. 课程 pipelineStatus === "completed" → 仅 maxline=0 时拦截
 *   2. pipelineProgress.isLastChapter === true → 仅 maxline=0 时拦截
 *   3. 存在 status === "generating" 的章节 → 有章节正在生成中
 *   4. 存在至少一个 completed 或 partial_completed 的章节 → 可以继续生成
 *   5. 以上都不满足 → 尚未完成任何章节，不可生成
 *
 * @param {Object} course - 课程对象（含 pipelineStatus 字符串、pipelineProgress JSON字符串/对象、maxline 数值、endline 数值）
 * @param {Array<{status: string}>} chapters - 章节数组
 * @returns {{ can: boolean, reason: string }}
 */
function computeCanGenerateNext(course, chapters) {
    // ========== 0. maxline 权威校验（Level 1 — 以数值为准，无视标记误判） ==========
    // maxline > 0 表示已记录了 MD 文件总行数，可以基于它做权威判断
    const maxline = course.maxline || 0;
    const endline = course.endline || 0;

    if (maxline > 0 && endline >= maxline) {
        // 数值证据：全部内容已处理完毕 → 不可生成（最权威的判断）
        console.log(TAG + " [maxline权威] endline(" + endline + ") >= maxline(" + maxline + ")，全部内容已处理完毕");
        return { can: false, reason: "全部内容已生成完毕" };
    }

    // maxline > 0 且 endline < maxline：有剩余内容，后续的 pipelineStatus/isLastChapter 检查将被覆盖
    const hasRemainingContent = maxline > 0 && endline < maxline;
    if (hasRemainingContent) {
        console.log(TAG + " [maxline权威] endline(" + endline + ") < maxline(" + maxline + ")，还有内容可生成，将覆盖 pipelineStatus/isLastChapter 标记");
    }

    // ========== 1. 课程整体已完成 ==========
    // 仅在 maxline=0（旧课程无数值证据）时以 pipelineStatus 为判断依据
    if (course.pipelineStatus === "completed") {
        if (hasRemainingContent) {
            console.log(TAG + " [maxline权威覆盖] pipelineStatus=completed，但 endline(" + endline + ") < maxline(" + maxline + ")，允许继续生成");
            // 不返回 false，继续向下检查
        } else {
            console.log(TAG + " 不允许：课程已完成（pipelineStatus=completed）");
            return { can: false, reason: "课程已完成" };
        }
    }

    // ========== 2. 已标记最后一章 ==========
    // 仅在 maxline=0（旧课程无数值证据）时以 isLastChapter 标记为判断依据
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
        if (hasRemainingContent) {
            console.log(TAG + " [maxline权威覆盖] isLastChapter=true，但 endline(" + endline + ") < maxline(" + maxline + ")，允许继续生成");
            // 不返回 false，继续向下检查
        } else {
            console.log(TAG + " 不允许：已是最后一章（pipelineProgress.isLastChapter=true）");
            return { can: false, reason: "已是最后一章" };
        }
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
