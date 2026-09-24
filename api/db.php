<?php
/**
 * ChaletWeShare — Database Connection Singleton & Helpers
 */

function getConfig() {
    static $config = null;
    if ($config === null) {
        $configFile = __DIR__ . '/config.php';
        if (!file_exists($configFile)) {
            $configFile = __DIR__ . '/config.example.php';
        }
        $config = file_exists($configFile) ? require $configFile : [];
    }
    return $config;
}

function getDbConnection() {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $config = getConfig();
    $dbHost = $config['db_host'] ?? '127.0.0.1';
    $dbName = $config['db_name'] ?? 'chaletweshare_db';
    $dbUser = $config['db_user'] ?? 'root';
    $dbPass = $config['db_pass'] ?? '';
    $charset = $config['db_charset'] ?? 'utf8mb4';

    // Try MariaDB / MySQL first
    try {
        $dsn = "mysql:host={$dbHost};dbname={$dbName};charset={$charset}";
        $pdo = new PDO($dsn, $dbUser, $dbPass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        initMysqlSchema($pdo);
        return $pdo;
    } catch (PDOException $e) {
        // Fallback to SQLite for seamless local development if MySQL isn't available
        $sqlitePath = __DIR__ . '/chaletweshare.sqlite';
        $isNewSqlite = !file_exists($sqlitePath);
        $pdo = new PDO("sqlite:{$sqlitePath}", null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec("PRAGMA foreign_keys = ON;");
        initSqliteSchema($pdo);
        return $pdo;
    }
}

function initMysqlSchema(PDO $pdo) {
    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                profile_id VARCHAR(8) NOT NULL UNIQUE,
                name VARCHAR(30) NOT NULL,
                avatar VARCHAR(30) NOT NULL DEFAULT 'swan',
                sync_token VARCHAR(32) NOT NULL UNIQUE,
                email VARCHAR(255) DEFAULT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_sync_token (sync_token)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                endpoint TEXT NOT NULL,
                p256dh VARCHAR(255) NOT NULL,
                auth VARCHAR(255) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS reservations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                date_start DATE NOT NULL,
                date_end DATE NOT NULL,
                status ENUM('pending','booked','vetoed','cancelled') NOT NULL DEFAULT 'pending',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                veto_deadline DATETIME DEFAULT NULL,
                resolved_at DATETIME DEFAULT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_dates (date_start, date_end),
                INDEX idx_status (status),
                INDEX idx_veto_deadline (veto_deadline)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS maintenance_blocks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                date_start DATE NOT NULL,
                date_end DATE NOT NULL,
                half_day ENUM('full','morning','afternoon') NOT NULL DEFAULT 'full',
                reason VARCHAR(200) NOT NULL DEFAULT 'Unterhalt',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_maint_dates (date_start, date_end)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS vetoes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                reservation_id INT NOT NULL,
                user_id INT NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_veto (reservation_id, user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS conflict_resolutions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                reservation_id INT NOT NULL,
                resolution_type ENUM('shared','rng','chat') NOT NULL,
                winner_user_id INT DEFAULT NULL,
                resolved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
                FOREIGN KEY (winner_user_id) REFERENCES users(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS conflict_proposals (
                id INT AUTO_INCREMENT PRIMARY KEY,
                reservation_id INT NOT NULL,
                proposer_user_id INT NOT NULL,
                proposal_type VARCHAR(50) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
                FOREIGN KEY (proposer_user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_res_proposal (reservation_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS chat_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                reservation_id INT DEFAULT NULL,
                maintenance_id INT DEFAULT NULL,
                user_id INT NOT NULL,
                message TEXT NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
                FOREIGN KEY (maintenance_id) REFERENCES maintenance_blocks(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_chat_reservation (reservation_id, created_at),
                INDEX idx_chat_maintenance (maintenance_id, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS chat_dismissals (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                reservation_id INT DEFAULT NULL,
                maintenance_id INT DEFAULT NULL,
                scope ENUM('user', 'all') NOT NULL DEFAULT 'user',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
                FOREIGN KEY (maintenance_id) REFERENCES maintenance_blocks(id) ON DELETE CASCADE,
                UNIQUE KEY unique_user_res_dismissal (user_id, reservation_id),
                UNIQUE KEY unique_user_maint_dismissal (user_id, maintenance_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS maintenance_overlap_approvals (
                id INT AUTO_INCREMENT PRIMARY KEY,
                maintenance_id INT NOT NULL,
                allowed_user_id INT NOT NULL,
                granted_by_user_id INT NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (maintenance_id) REFERENCES maintenance_blocks(id) ON DELETE CASCADE,
                FOREIGN KEY (allowed_user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_maint_allowed (maintenance_id, allowed_user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                type VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                is_read TINYINT(1) NOT NULL DEFAULT 0,
                related_reservation_id INT DEFAULT NULL,
                action_payload JSON DEFAULT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (related_reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
                INDEX idx_user_unread (user_id, is_read)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS handover_notes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                reservation_id INT NOT NULL,
                author_user_id INT NOT NULL,
                target_reservation_id INT DEFAULT NULL,
                category VARCHAR(50) NOT NULL DEFAULT 'custom',
                message TEXT NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
                FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (target_reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
                INDEX idx_handover_res (reservation_id),
                INDEX idx_handover_target (target_reservation_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS reservation_approvals (
                id INT AUTO_INCREMENT PRIMARY KEY,
                reservation_id INT NOT NULL,
                user_id INT NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_approval (reservation_id, user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS working_days (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                date DATE NULL DEFAULT NULL,
                season ENUM('spring','autumn') NOT NULL,
                status ENUM('proposed','finalized') NOT NULL DEFAULT 'finalized',
                proposed_dates JSON DEFAULT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_working_day_date (date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS working_day_rsvps (
                id INT AUTO_INCREMENT PRIMARY KEY,
                working_day_id INT NOT NULL,
                user_id INT NOT NULL,
                status ENUM('yes','no','pending') NOT NULL DEFAULT 'pending',
                votes JSON DEFAULT NULL,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (working_day_id) REFERENCES working_days(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_user_working_day (working_day_id, user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS push_throttle (
                user_id INT NOT NULL,
                channel_key VARCHAR(100) NOT NULL,
                last_sent_at DATETIME NOT NULL,
                PRIMARY KEY (user_id, channel_key),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ");

        try {
            $pdo->exec("ALTER TABLE chat_messages MODIFY COLUMN reservation_id INT NULL");
        } catch (\Throwable $e) {}
        try {
            $pdo->exec("ALTER TABLE chat_messages ADD COLUMN maintenance_id INT NULL AFTER reservation_id");
            $pdo->exec("ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_maintenance FOREIGN KEY (maintenance_id) REFERENCES maintenance_blocks(id) ON DELETE CASCADE");
            $pdo->exec("ALTER TABLE chat_messages ADD INDEX idx_chat_maintenance (maintenance_id, created_at)");
        } catch (\Throwable $e) {}
        try {
            $pdo->exec("ALTER TABLE notifications ADD COLUMN action_payload JSON DEFAULT NULL AFTER related_reservation_id");
        } catch (\Throwable $e) {}
        try {
            $pdo->exec("ALTER TABLE working_days MODIFY COLUMN date DATE NULL");
        } catch (\Throwable $e) {}
        try {
            $pdo->exec("ALTER TABLE working_days ADD COLUMN status ENUM('proposed','finalized') NOT NULL DEFAULT 'finalized' AFTER season");
        } catch (\Throwable $e) {}
        try {
            $pdo->exec("ALTER TABLE working_days ADD COLUMN proposed_dates JSON DEFAULT NULL AFTER status");
        } catch (\Throwable $e) {}
        try {
            $pdo->exec("ALTER TABLE working_day_rsvps MODIFY COLUMN status ENUM('yes','no','pending') NOT NULL DEFAULT 'pending'");
        } catch (\Throwable $e) {}
        try {
            $pdo->exec("ALTER TABLE working_day_rsvps ADD COLUMN votes JSON DEFAULT NULL AFTER status");
        } catch (\Throwable $e) {}
    } catch (\Throwable $e) {
        // ignore if already exists or handled
    }
}

function initSqliteSchema(PDO $pdo) {
    $schemaSql = "
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        avatar TEXT NOT NULL DEFAULT 'swan',
        sync_token TEXT NOT NULL UNIQUE,
        email TEXT DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date_start TEXT NOT NULL,
        date_end TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        veto_deadline DATETIME DEFAULT NULL,
        resolved_at DATETIME DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS maintenance_blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date_start TEXT NOT NULL,
        date_end TEXT NOT NULL,
        half_day TEXT NOT NULL DEFAULT 'full',
        reason TEXT NOT NULL DEFAULT 'Unterhalt',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vetoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (reservation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS conflict_resolutions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        resolution_type TEXT NOT NULL,
        winner_user_id INTEGER DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
        resolved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conflict_proposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        proposer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        proposal_type TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (reservation_id)
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reservation_id INTEGER DEFAULT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        maintenance_id INTEGER DEFAULT NULL REFERENCES maintenance_blocks(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_dismissals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reservation_id INTEGER DEFAULT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        maintenance_id INTEGER DEFAULT NULL REFERENCES maintenance_blocks(id) ON DELETE CASCADE,
        scope TEXT NOT NULL DEFAULT 'user',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, reservation_id),
        UNIQUE (user_id, maintenance_id)
    );

    CREATE TABLE IF NOT EXISTS maintenance_overlap_approvals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        maintenance_id INTEGER NOT NULL REFERENCES maintenance_blocks(id) ON DELETE CASCADE,
        allowed_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        granted_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (maintenance_id, allowed_user_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        related_reservation_id INTEGER DEFAULT NULL REFERENCES reservations(id) ON DELETE SET NULL,
        action_payload TEXT DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS handover_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_reservation_id INTEGER DEFAULT NULL REFERENCES reservations(id) ON DELETE SET NULL,
        category TEXT NOT NULL DEFAULT 'custom',
        message TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reservation_approvals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (reservation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS working_days (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date TEXT DEFAULT NULL,
        season TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'finalized',
        proposed_dates TEXT DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS working_day_rsvps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        working_day_id INTEGER NOT NULL REFERENCES working_days(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        votes TEXT DEFAULT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (working_day_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS push_throttle (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        channel_key TEXT NOT NULL,
        last_sent_at DATETIME NOT NULL,
        PRIMARY KEY (user_id, channel_key)
    );

    DROP TABLE IF EXISTS statistics;
    ";
    $pdo->exec($schemaSql);

    // Self-healing migration for existing SQLite databases:
    // Check if maintenance_id column exists or if reservation_id is NOT NULL in chat_messages
    try {
        $cols = $pdo->query("PRAGMA table_info(chat_messages)")->fetchAll(PDO::FETCH_ASSOC);
        $hasMaint = false;
        $resNotNull = false;
        foreach ($cols as $col) {
            if ($col['name'] === 'maintenance_id') {
                $hasMaint = true;
            }
            if ($col['name'] === 'reservation_id' && !empty($col['notnull'])) {
                $resNotNull = true;
            }
        }
        if (!$hasMaint || $resNotNull) {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS chat_messages_v2 (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    reservation_id INTEGER DEFAULT NULL REFERENCES reservations(id) ON DELETE CASCADE,
                    maintenance_id INTEGER DEFAULT NULL REFERENCES maintenance_blocks(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    message TEXT NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                INSERT INTO chat_messages_v2 (id, reservation_id, user_id, message, created_at)
                    SELECT id, reservation_id, user_id, message, created_at FROM chat_messages;
                DROP TABLE chat_messages;
                ALTER TABLE chat_messages_v2 RENAME TO chat_messages;
            ");
        }
    } catch (\Throwable $e) {
        // ignore if handled
    }
    
    try {
        $cols = $pdo->query("PRAGMA table_info(notifications)")->fetchAll(PDO::FETCH_ASSOC);
        $hasPayload = false;
        foreach ($cols as $col) {
            if ($col['name'] === 'action_payload') {
                $hasPayload = true;
                break;
            }
        }
        if (!$hasPayload) {
            $pdo->exec("ALTER TABLE notifications ADD COLUMN action_payload TEXT DEFAULT NULL");
        }
    } catch (\Throwable $e) {
        // ignore if handled
    }

    try {
        $cols = $pdo->query("PRAGMA table_info(working_days)")->fetchAll(PDO::FETCH_ASSOC);
        $hasStatus = false;
        $hasProposed = false;
        foreach ($cols as $col) {
            if ($col['name'] === 'status') $hasStatus = true;
            if ($col['name'] === 'proposed_dates') $hasProposed = true;
        }
        if (!$hasStatus) {
            $pdo->exec("ALTER TABLE working_days ADD COLUMN status TEXT NOT NULL DEFAULT 'finalized'");
        }
        if (!$hasProposed) {
            $pdo->exec("ALTER TABLE working_days ADD COLUMN proposed_dates TEXT DEFAULT NULL");
        }
    } catch (\Throwable $e) {}

    try {
        $cols = $pdo->query("PRAGMA table_info(working_day_rsvps)")->fetchAll(PDO::FETCH_ASSOC);
        $hasVotes = false;
        foreach ($cols as $col) {
            if ($col['name'] === 'votes') $hasVotes = true;
        }
        if (!$hasVotes) {
            $pdo->exec("ALTER TABLE working_day_rsvps ADD COLUMN votes TEXT DEFAULT NULL");
        }
    } catch (\Throwable $e) {}
}

function setCorsHeaders() {
    if (php_sapi_name() === 'cli' || headers_sent()) {
        return;
    }
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $config = getConfig();
    $allowed = $config['allowed_origins'] ?? [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
    ];

    if (!empty($origin)) {
        if (in_array($origin, $allowed, true)) {
            header("Access-Control-Allow-Origin: {$origin}");
            header('Vary: Origin');
        }
    }
    header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Cron-Key, X-Gate-Token');
}

function jsonResponse($data, $statusCode = 200) {
    if (php_sapi_name() !== 'cli' && !headers_sent()) {
        http_response_code($statusCode);
        setCorsHeaders();
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Cache-Control: post-check=0, pre-check=0', false);
        header('Pragma: no-cache');
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function getJsonInput() {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        jsonResponse(['status' => 'ok']);
    }
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/**
 * Shared authentication by profile_id and sync_token
 */
function authenticateUser(PDO $pdo, $profileId, $syncToken) {
    if (empty($profileId) || empty($syncToken)) {
        return null;
    }
    $stmt = $pdo->prepare("SELECT id, profile_id, name, avatar, email, sync_token FROM users WHERE profile_id = ? AND sync_token = ?");
    $stmt->execute([$profileId, $syncToken]);
    $user = $stmt->fetch();
    return $user ?: null;
}

/**
 * Shared authentication by user_id and sync_token
 */
function authenticateUserById(PDO $pdo, $userId, $syncToken) {
    if (empty($userId) || empty($syncToken)) {
        return null;
    }
    $stmt = $pdo->prepare("SELECT id, profile_id, name, avatar, email, sync_token FROM users WHERE id = ? AND sync_token = ?");
    $stmt->execute([(int)$userId, $syncToken]);
    $user = $stmt->fetch();
    return $user ?: null;
}

/**
 * Generate a cryptographic gate token based on the family password hash
 */
function generateGateToken(): string {
    $config = getConfig();
    $familyHash = $config['family_password_hash'] ?? 'default_family_salt';
    return hash_hmac('sha256', 'chalet_family_gate_authorized', $familyHash);
}

/**
 * Verify a given gate token
 */
function verifyGateToken(?string $token): bool {
    if (empty($token)) {
        return false;
    }
    $expected = generateGateToken();
    return hash_equals($expected, $token);
}

/**
 * Extract gate token from various request sources:
 * - Header: X-Gate-Token
 * - Header: Authorization: Bearer <token>
 * - JSON input: $input['gate_token']
 * - GET param: $_GET['gate_token']
 */
function getProvidedGateToken($input = null): ?string {
    if (!empty($_SERVER['HTTP_X_GATE_TOKEN'])) {
        return trim($_SERVER['HTTP_X_GATE_TOKEN']);
    }

    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (empty($authHeader) && function_exists('getallheaders')) {
        $headers = getallheaders();
        foreach ($headers as $k => $v) {
            if (strtolower($k) === 'authorization') {
                $authHeader = $v;
            } elseif (strtolower($k) === 'x-gate-token') {
                return trim($v);
            }
        }
    }

    if (!empty($authHeader) && preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
        return $matches[1];
    }

    if (is_array($input) && !empty($input['gate_token'])) {
        return trim($input['gate_token']);
    }

    if (!empty($_GET['gate_token'])) {
        return trim($_GET['gate_token']);
    }

    return null;
}

/**
 * Guard endpoint: requires either a valid gate token or a valid registered user session
 */
function requireGateOrUser(PDO $pdo, $input = null) {
    // 1. Check gate token
    $gateToken = getProvidedGateToken($input);
    if (verifyGateToken($gateToken)) {
        return true;
    }

    // 2. Check user authentication (profile_id + sync_token or user_id + sync_token)
    $profileId = is_array($input) ? ($input['profile_id'] ?? null) : null;
    $syncToken = is_array($input) ? ($input['sync_token'] ?? null) : null;
    if (empty($profileId)) $profileId = $_GET['profile_id'] ?? null;
    if (empty($syncToken)) $syncToken = $_GET['sync_token'] ?? null;

    if (!empty($profileId) && !empty($syncToken)) {
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if ($user) {
            return $user;
        }
    }

    $userId = is_array($input) ? ($input['user_id'] ?? null) : null;
    if (empty($userId)) $userId = $_GET['user_id'] ?? null;
    if (!empty($userId) && !empty($syncToken)) {
        $user = authenticateUserById($pdo, $userId, $syncToken);
        if ($user) {
            return $user;
        }
    }

    jsonResponse(['success' => false, 'error' => 'Nicht autorisiert. Bitte gib das Familien-Passwort ein.'], 401);
}


