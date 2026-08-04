-- AlterTable：UserDailyActivity 表新增 study_duration 字段
-- 用途：记录用户当天的新增学习时长（秒），支撑学习周报按日统计
-- 数据来源：保存学习进度（PUT /api/v1/progress）时按 studyDuration 增量累加
ALTER TABLE `UserDailyActivity`
  ADD COLUMN `study_duration` INT UNSIGNED NOT NULL DEFAULT 0
  AFTER `activity_date`;
