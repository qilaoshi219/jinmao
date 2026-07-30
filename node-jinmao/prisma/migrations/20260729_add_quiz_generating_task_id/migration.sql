-- 为 QuizTextbook 表新增 generating_task_id 字段
-- 用于关联后台 MD→JSON 生成任务，有值时表示题库正在由 AI 生成中

ALTER TABLE `QuizTextbook` ADD COLUMN `generating_task_id` VARCHAR(36) NULL;
