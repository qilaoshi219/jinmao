-- AlterTable：AI 助教对话增加页码快照
-- 上下文素材（当前页口播稿/助教提示）在对话首条消息时确定，翻页不更新
ALTER TABLE `AiConversation` ADD COLUMN `page_number` INT NOT NULL DEFAULT 1;
