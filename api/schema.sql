-- ============================================================
-- ChaletWeShare — MariaDB / MySQL Database Schema
-- Compatible with MySQL 8.0+ and MariaDB 10.4+
-- ============================================================

CREATE TABLE IF NOT EXISTS `users` (
    `id`            INT AUTO_INCREMENT PRIMARY KEY,
    `profile_id`    VARCHAR(8) NOT NULL UNIQUE,
    `name`          VARCHAR(30) NOT NULL,
    `avatar`        VARCHAR(30) NOT NULL DEFAULT 'swan',
    `sync_token`    VARCHAR(32) NOT NULL UNIQUE,
    `email`         VARCHAR(255) DEFAULT NULL,
    `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_sync_token` (`sync_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
    `id`            INT AUTO_INCREMENT PRIMARY KEY,
    `user_id`       INT NOT NULL,
    `endpoint`      TEXT NOT NULL,
    `p256dh`        VARCHAR(255) NOT NULL,
    `auth`          VARCHAR(255) NOT NULL,
    `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `reservations` (
    `id`            INT AUTO_INCREMENT PRIMARY KEY,
    `user_id`       INT NOT NULL,
    `date_start`    DATE NOT NULL,
    `date_end`      DATE NOT NULL,
    `status`        ENUM('pending','booked','vetoed','cancelled') NOT NULL DEFAULT 'pending',
    `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `veto_deadline` DATETIME DEFAULT NULL,
    `resolved_at`   DATETIME DEFAULT NULL,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_dates` (`date_start`, `date_end`),
    INDEX `idx_status` (`status`),
    INDEX `idx_veto_deadline` (`veto_deadline`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `maintenance_blocks` (
    `id`            INT AUTO_INCREMENT PRIMARY KEY,
    `user_id`       INT NOT NULL,
    `date_start`    DATE NOT NULL,
    `date_end`      DATE NOT NULL,
    `half_day`      ENUM('full','morning','afternoon') NOT NULL DEFAULT 'full',
    `reason`        VARCHAR(200) NOT NULL DEFAULT 'Unterhalt',
    `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_maint_dates` (`date_start`, `date_end`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `vetoes` (
    `id`              INT AUTO_INCREMENT PRIMARY KEY,
    `reservation_id`  INT NOT NULL,
    `user_id`         INT NOT NULL,
    `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `unique_veto` (`reservation_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `conflict_resolutions` (
    `id`              INT AUTO_INCREMENT PRIMARY KEY,
    `reservation_id`  INT NOT NULL,
    `resolution_type` ENUM('shared','rng','chat') NOT NULL,
    `winner_user_id`  INT DEFAULT NULL,
    `resolved_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`winner_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `conflict_proposals` (
    `id`                INT AUTO_INCREMENT PRIMARY KEY,
    `reservation_id`    INT NOT NULL,
    `proposer_user_id`  INT NOT NULL,
    `proposal_type`     VARCHAR(50) NOT NULL,
    `created_at`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`proposer_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `unique_res_proposal` (`reservation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `chat_messages` (
    `id`              INT AUTO_INCREMENT PRIMARY KEY,
    `reservation_id`  INT DEFAULT NULL,
    `maintenance_id`  INT DEFAULT NULL,
    `user_id`         INT NOT NULL,
    `message`         TEXT NOT NULL,
    `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`maintenance_id`) REFERENCES `maintenance_blocks`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_chat_reservation` (`reservation_id`, `created_at`),
    INDEX `idx_chat_maintenance` (`maintenance_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `chat_dismissals` (
    `id`             INT AUTO_INCREMENT PRIMARY KEY,
    `user_id`        INT NOT NULL,
    `reservation_id` INT DEFAULT NULL,
    `maintenance_id` INT DEFAULT NULL,
    `scope`          ENUM('user', 'all') NOT NULL DEFAULT 'user',
    `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`maintenance_id`) REFERENCES `maintenance_blocks`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `unique_user_res_dismissal` (`user_id`, `reservation_id`),
    UNIQUE KEY `unique_user_maint_dismissal` (`user_id`, `maintenance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `maintenance_overlap_approvals` (
    `id`                 INT AUTO_INCREMENT PRIMARY KEY,
    `maintenance_id`     INT NOT NULL,
    `allowed_user_id`    INT NOT NULL,
    `granted_by_user_id` INT NOT NULL,
    `created_at`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`maintenance_id`) REFERENCES `maintenance_blocks`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`allowed_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`granted_by_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `unique_maint_allowed` (`maintenance_id`, `allowed_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `notifications` (
    `id`                      INT AUTO_INCREMENT PRIMARY KEY,
    `user_id`                 INT NOT NULL,
    `type`                    VARCHAR(50) NOT NULL,
    `message`                 TEXT NOT NULL,
    `is_read`                 TINYINT(1) NOT NULL DEFAULT 0,
    `related_reservation_id`  INT DEFAULT NULL,
    `action_payload`          JSON DEFAULT NULL,
    `created_at`              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`related_reservation_id`) REFERENCES `reservations`(`id`) ON DELETE SET NULL,
    INDEX `idx_user_unread` (`user_id`, `is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `handover_notes` (
    `id`                      INT AUTO_INCREMENT PRIMARY KEY,
    `reservation_id`          INT NOT NULL,
    `author_user_id`          INT NOT NULL,
    `target_reservation_id`   INT DEFAULT NULL,
    `category`                VARCHAR(50) NOT NULL DEFAULT 'custom',
    `message`                 TEXT NOT NULL,
    `created_at`              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`target_reservation_id`) REFERENCES `reservations`(`id`) ON DELETE SET NULL,
    INDEX `idx_handover_res` (`reservation_id`),
    INDEX `idx_handover_target` (`target_reservation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `reservation_approvals` (
    `id`              INT AUTO_INCREMENT PRIMARY KEY,
    `reservation_id`  INT NOT NULL,
    `user_id`         INT NOT NULL,
    `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `unique_approval` (`reservation_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `working_days` (
    `id`              INT AUTO_INCREMENT PRIMARY KEY,
    `user_id`         INT NOT NULL,
    `date`            DATE DEFAULT NULL,
    `season`          ENUM('spring','autumn') NOT NULL,
    `status`          ENUM('proposed','finalized') NOT NULL DEFAULT 'finalized',
    `proposed_dates`  JSON DEFAULT NULL,
    `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_working_day_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `working_day_rsvps` (
    `id`              INT AUTO_INCREMENT PRIMARY KEY,
    `working_day_id`  INT NOT NULL,
    `user_id`         INT NOT NULL,
    `status`          ENUM('yes','no','pending') NOT NULL DEFAULT 'pending',
    `votes`           JSON DEFAULT NULL,
    `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`working_day_id`) REFERENCES `working_days`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `unique_user_working_day` (`working_day_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `push_throttle` (
    `user_id`         INT NOT NULL,
    `channel_key`     VARCHAR(100) NOT NULL,
    `last_sent_at`    DATETIME NOT NULL,
    PRIMARY KEY (`user_id`, `channel_key`),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
