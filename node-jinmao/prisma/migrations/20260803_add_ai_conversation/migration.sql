-- CreateTable：创建 AI 助教对话表 AiConversation
-- 记录用户在课程-章节维度的 AI 助教对话，懒创建（首条消息时才落库）
CREATE TABLE `AiConversation` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `course_id` BIGINT UNSIGNED NOT NULL,
    `chapter_id` BIGINT UNSIGNED NOT NULL,
    `title` VARCHAR(100) NOT NULL DEFAULT '',
    `model` VARCHAR(20) NOT NULL DEFAULT 'flash',
    `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `update_time` DATETIME(3) NOT NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 添加索引：按用户+课程查询对话列表
CREATE INDEX `AiConversation_user_id_course_id_idx` ON `AiConversation`(`user_id`, `course_id`);
CREATE INDEX `AiConversation_user_id_course_id_chapter_id_idx` ON `AiConversation`(`user_id`, `course_id`, `chapter_id`);

-- 添加外键约束
ALTER TABLE `AiConversation` ADD CONSTRAINT `AiConversation_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AiConversation` ADD CONSTRAINT `AiConversation_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `Course`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AiConversation` ADD CONSTRAINT `AiConversation_chapter_id_fkey` FOREIGN KEY (`chapter_id`) REFERENCES `Chapter`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable：创建 AI 助教消息表 AiMessage
-- 追加式消息历史，每条消息记录 token 用量与费用
CREATE TABLE `AiMessage` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `conversation_id` BIGINT UNSIGNED NOT NULL,
    `role` VARCHAR(10) NOT NULL,
    `content` TEXT NOT NULL,
    `prompt_tokens` INT NULL,
    `completion_tokens` INT NULL,
    `total_tokens` INT NULL,
    `cost` DECIMAL(18, 7) NULL,
    `suggestions` JSON NULL,
    `create_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 添加索引：按对话查询消息
CREATE INDEX `AiMessage_conversation_id_idx` ON `AiMessage`(`conversation_id`);

-- 添加外键约束
ALTER TABLE `AiMessage` ADD CONSTRAINT `AiMessage_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `AiConversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
