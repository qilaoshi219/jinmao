-- 为 Course 表新增 maxline 字段（MD 文件总行数）
-- 用于权威判断教材是否已全部生成完毕
-- 新增 maxline 字段后，可基于 endline < maxline 做数值级判断，无视 isLastChapter 等标记的误判
ALTER TABLE `Course` ADD COLUMN `maxline` INT UNSIGNED NOT NULL DEFAULT 0
  AFTER `endline`;
