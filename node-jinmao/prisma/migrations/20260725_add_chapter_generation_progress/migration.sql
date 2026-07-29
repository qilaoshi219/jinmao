-- AlterTable：Chapter 表新增 generation_progress 字段
-- 用途：记录单个章节的生成流水线实时进度（JSON 格式）
-- 结构：{ phase, outlineProgress, elaborationProgress, filesProgress }
-- 仅在章节 status === "generating" 时有值，生成完成后清空
ALTER TABLE `Chapter` ADD COLUMN `generation_progress` VARCHAR(1000) NULL;
