-- AlterTable: billing_record 表新增 error_message（失败原因）和 retry_count（重试次数）字段
ALTER TABLE `billing_record` 
  ADD COLUMN `error_message` TEXT NULL COMMENT '失败原因（仅 status=failed 时记录，方便排查问题）',
  ADD COLUMN `retry_count` INT NOT NULL DEFAULT 0 COMMENT '重试次数（0 表示首次调用，最多重试 3 次）';
