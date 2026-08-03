-- AlterTable：AI 助教消息增加思考过程字段（thinking 模式，可折叠展示）
ALTER TABLE `AiMessage` ADD COLUMN `thinking` TEXT NULL;
