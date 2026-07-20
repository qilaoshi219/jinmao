-- AlterTable：为 Course 表添加 subtitle 列
-- 用于存储 AI 生成的课程副标题
ALTER TABLE `Course` ADD COLUMN `subtitle` VARCHAR(200) NULL AFTER `cover_path`;
