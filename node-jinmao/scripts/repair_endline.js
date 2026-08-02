// ==================== 一次性数据修复脚本：重建损坏课程的绝对 endline ====================
// 背景：
//   旧版 course_pipeline.js 存在"相对/绝对行号混淆"bug —— addLineNumbers 将提取出的文本块
//   从 1 重新编号，AI 返回的是"相对本次提取 chunk"的行号，但旧代码把相对行号直接当作
//   MD 文件绝对行号写入 Chapter.startline/endline 和 Course.endline，
//   导致 endline 越生成越小（如 800 → 170 → 70），提取窗口回退、循环生成第一章内容。
//
// 本脚本用途：
//   1. 检测损坏课程：正确行为下 Course.endline 永不小于任意非删除章节的 endline
//      （endline 只前进不后退）。若 course.endline < max(章节 endline) 判定为损坏。
//   2. 重建绝对行号：利用"相对跨度 = 绝对跨度"的性质迭代还原 ——
//      第 N 章提取起点 = 第 N-1 章真实绝对 endline + 1，
//      第 N 章真实绝对 endline = 提取起点 + 存储的相对 endline - 1 = prevAbs + ch.endline。
//   3. 安全兜底：修复后 endline 若 ≥ maxline，同步置 pipelineProgress.isLastChapter=true。
//
// 执行方式：
//   node scripts/repair_endline.js            → dry-run，仅预览将修复的内容
//   node scripts/repair_endline.js --apply    → 真正写库（事务批量提交）
//
// 注意：本脚本为一次性修复工具，修复完成后可保留用于审计，不影响正常业务。

"use strict";

// 加载 .env（显式指定路径，保证任意 cwd 下都能读到 DATABASE_URL）
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const prisma = require("../utils/prisma"); // 复用项目 Prisma 单例

const TAG = "[repair_endline]";
const APPLY = process.argv.includes("--apply"); // 是否真正写库

/**
 * 主流程：扫描课程 → 检测损坏 → 重建绝对行号 → （可选）写库
 */
async function main() {
  console.log(TAG + " ========== endline 数据修复脚本启动 ==========");
  console.log(TAG + " 执行模式: " + (APPLY ? "** --apply（真正写库）**" : "dry-run（仅预览，不写库）"));

  // ---- 1. 查询所有未删除课程（含未删除章节，按 sequence 升序） ----
  const courses = await prisma.course.findMany({
    where: { isDeleted: false },
    include: {
      chapters: {
        where: { isDeleted: false },
        orderBy: { sequence: "asc" },
      },
    },
  });
  console.log(TAG + " 扫描到未删除课程 " + courses.length + " 门。");

  // ---- 2. 检测损坏课程并重建绝对行号 ----
  const repairPlans = []; // 收集待修复内容，统一预览 / 统一提交
  let damagedCount = 0;

  for (const course of courses) {
    const chapters = course.chapters;
    if (chapters.length === 0) continue; // 无章节的课程无需处理

    // 2.1 检测：正确行为下 course.endline >= 任意章节 endline（只前进不后退）
    const maxChapterEndline = Math.max(...chapters.map((c) => c.endline));
    if (course.endline >= maxChapterEndline) continue; // 未损坏，跳过

    damagedCount++;
    console.log(TAG + " ── 检测到损坏课程 #" + course.id + "（" + course.name + "）");
    console.log(TAG + "    course.endline=" + course.endline +
      "，maxline=" + course.maxline +
      "，最大章节 endline=" + maxChapterEndline + " → 判定为 endline 倒退损坏");

    // 2.2 迭代还原真实绝对行号（相对跨度 = 绝对跨度，逐章累加）
    //     第 N 章绝对 endline = 上一章真实绝对 endline + 本章存储 endline
    //     第 N 章绝对 startline = 上一章真实绝对 endline + 本章存储 startline
    let prevAbs = 0;
    const chapterUpdates = chapters.map((ch) => {
      const absStartline = prevAbs + ch.startline;
      const absEndline = prevAbs + ch.endline;
      prevAbs = absEndline; // 更新偏移基准
      return {
        chapter: ch,
        absStartline,
        absEndline,
        needsChapterFix: ch.startline !== absStartline || ch.endline !== absEndline,
      };
    });

    // 2.3 安全兜底：修复后 endline 不得超过 maxline；若 ≥ maxline 则置 isLastChapter=true
    let repairedEndline = prevAbs;
    const maxline = course.maxline || 0;
    if (maxline > 0 && repairedEndline > maxline) {
      console.log(TAG + "    警告：重建 endline(" + repairedEndline + ") 超过 maxline(" + maxline + ")，钳制为 maxline");
      repairedEndline = maxline;
    }
    const setLastChapter = maxline > 0 && repairedEndline >= maxline;

    console.log(TAG + "    重建结果: 章节行号 →");
    for (const cu of chapterUpdates) {
      console.log(TAG + "      第" + cu.chapter.sequence + "章(" + cu.chapter.name + "): [" +
        cu.chapter.startline + ", " + cu.chapter.endline + "] → 绝对[" +
        cu.absStartline + ", " + cu.absEndline + "]");
    }
    console.log(TAG + "    course.endline: " + course.endline + " → " + repairedEndline +
      (setLastChapter ? "（已达文件末尾，将补设 isLastChapter=true）" : ""));

    repairPlans.push({ course, chapterUpdates, repairedEndline, setLastChapter });
  }

  // ---- 3. 汇总输出 ----
  console.log(TAG + " ========== 扫描汇总 ==========");
  console.log(TAG + " 损坏课程数: " + damagedCount + " / " + courses.length);

  if (repairPlans.length === 0) {
    console.log(TAG + " 未发现损坏课程，无需修复。");
    return;
  }

  if (!APPLY) {
    console.log(TAG + " 当前为 dry-run 模式，以上仅预览。确认无误后执行: node scripts/repair_endline.js --apply");
    return;
  }

  // ---- 4. 写库（事务批量提交，保证原子性） ----
  console.log(TAG + " 开始写库修复 " + repairPlans.length + " 门课程...");

  for (const plan of repairPlans) {
    const ops = [];
    // 4.1 逐章更新绝对行号
    for (const cu of plan.chapterUpdates) {
      if (cu.needsChapterFix) {
        ops.push(
          prisma.chapter.update({
            where: { id: cu.chapter.id },
            data: { startline: cu.absStartline, endline: cu.absEndline },
          })
        );
      }
    }
    // 4.2 更新课程 endline
    ops.push(
      prisma.course.update({
        where: { id: plan.course.id },
        data: { endline: plan.repairedEndline },
      })
    );
    // 4.3 安全兜底：置 isLastChapter 标记
    if (plan.setLastChapter) {
      let progress = {};
      if (plan.course.pipelineProgress) {
        try {
          progress = JSON.parse(plan.course.pipelineProgress);
        } catch (_) { /* 解析失败则用空对象 */ }
      }
      progress.isLastChapter = true;
      ops.push(
        prisma.course.update({
          where: { id: plan.course.id },
          data: { pipelineProgress: JSON.stringify(progress) },
        })
      );
    }

    await prisma.$transaction(ops);
    console.log(TAG + "  ✅ 课程 #" + plan.course.id + " 修复完成: endline=" + plan.repairedEndline);
  }

  console.log(TAG + " ========== 修复完成，共 " + repairPlans.length + " 门课程 ==========");
}

// ---- 启动入口：捕获异常后退出码非 0，便于脚本调用方感知失败 ----
main()
  .then(() => {
    console.log(TAG + " 脚本执行结束。");
    process.exit(0);
  })
  .catch((err) => {
    console.error(TAG + " 脚本执行失败: " + err.message);
    console.error(err.stack);
    process.exit(1);
  });
