<?php
/**
 * ChaletWeShare — Web Push API & Dispatcher
 */

require_once __DIR__ . '/db.php';

// If autoload exists, load composer dependencies
if (file_exists(__DIR__ . '/vendor/autoload.php')) {
    require_once __DIR__ . '/vendor/autoload.php';
}

use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

$pdo = getDbConnection();
$data = getJsonInput();
$action = $data['action'] ?? ($_GET['action'] ?? '');

// Helper to get VAPID configuration
function getVapidConfig()
{
    $configFile = __DIR__ . '/config.php';
    if (!file_exists($configFile)) {
        return null;
    }
    $cfg = require $configFile;
    if (empty($cfg['vapid_public_key']) || empty($cfg['vapid_private_key'])) {
        return null;
    }
    return [
        'subject' => $cfg['vapid_subject'] ?? 'mailto:chalet@chaletshare.demo',
        'publicKey' => $cfg['vapid_public_key'],
        'privateKey' => $cfg['vapid_private_key'],
    ];
}

// Helper to authenticate user via sync_token
function authenticatePushUser($pdo, $userId, $syncToken)
{
    if (!$userId || !$syncToken) {
        return null;
    }
    $stmt = $pdo->prepare("SELECT id, name, sync_token FROM users WHERE id = ? AND sync_token = ?");
    $stmt->execute([$userId, $syncToken]);
    return $stmt->fetch();
}

/**
 * Convert raw base64url EC private key to SEC1 PEM format for OpenSSL
 */
function getEcPrivateKeyPem($rawPrivBase64Url, $rawPubBase64Url)
{
    if (strpos($rawPrivBase64Url, 'BEGIN') !== false) {
        return $rawPrivBase64Url;
    }

    $decodeB64Url = function ($data) {
        $padding = strlen($data) % 4;
        if ($padding) {
            $data .= str_repeat('=', 4 - $padding);
        }
        return base64_decode(strtr($data, '-_', '+/'));
    };

    $rawPriv = $decodeB64Url($rawPrivBase64Url);
    $rawPub = $decodeB64Url($rawPubBase64Url);

    if (strlen($rawPriv) !== 32) {
        return null;
    }

    $derPrefix = hex2bin("30770201010420");
    $derMid = hex2bin("a00a06082a8648ce3d030107a144034200");

    $fullDer = $derPrefix . $rawPriv . $derMid . $rawPub;
    return "-----BEGIN EC PRIVATE KEY-----\n" . chunk_split(base64_encode($fullDer), 64, "\n") . "-----END EC PRIVATE KEY-----\n";
}

/**
 * Generate VAPID JWT signature (Pure PHP fallback)
 */
function generateVapidJwtNative($endpoint, $vapidKeys)
{
    $header = json_encode(['typ' => 'JWT', 'alg' => 'ES256']);
    $url = parse_url($endpoint);
    $aud = ($url['scheme'] ?? 'https') . '://' . ($url['host'] ?? '');
    $payload = json_encode(['aud' => $aud, 'exp' => time() + 43200, 'sub' => $vapidKeys['subject']]);

    $encode = function ($data) {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    };

    $b64Header = $encode($header);
    $b64Payload = $encode($payload);

    $keyPem = getEcPrivateKeyPem($vapidKeys['privateKey'], $vapidKeys['publicKey']);
    if (!$keyPem) {
        error_log("generateVapidJwtNative: Failed to format EC private key PEM");
        return false;
    }

    $privateKeyId = openssl_pkey_get_private($keyPem);
    if (!$privateKeyId) {
        error_log("generateVapidJwtNative: openssl_pkey_get_private failed");
        return false;
    }

    $signature = '';
    $signed = openssl_sign($b64Header . "." . $b64Payload, $signature, $privateKeyId, OPENSSL_ALGO_SHA256);
    if (!$signed) {
        error_log("generateVapidJwtNative: openssl_sign failed");
        return false;
    }

    $hex = bin2hex($signature);
    if (substr($hex, 0, 2) !== '30')
        return false;
    $rStart = 8;
    $rLen = hexdec(substr($hex, 6, 2)) * 2;
    $rHex = substr($hex, $rStart, $rLen);
    if (strlen($rHex) > 64)
        $rHex = substr($rHex, 2);
    $rHex = str_pad($rHex, 64, '0', STR_PAD_LEFT);

    $sStart = $rStart + $rLen + 4;
    $sLen = hexdec(substr($hex, $sStart - 2, 2)) * 2;
    $sHex = substr($hex, $sStart, $sLen);
    if (strlen($sHex) > 64)
        $sHex = substr($sHex, 2);
    $sHex = str_pad($sHex, 64, '0', STR_PAD_LEFT);

    $rawSignature = hex2bin($rHex . $sHex);
    return $b64Header . "." . $b64Payload . "." . $encode($rawSignature);
}

/**
 * Native cURL push dispatch without payload (wakes up SW)
 */
function sendWebPushNative($endpoint, $vapidKeys)
{
    $jwt = generateVapidJwtNative($endpoint, $vapidKeys);
    if (!$jwt) {
        error_log("sendWebPushNative: Failed to generate VAPID JWT for $endpoint");
        return false;
    }

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $endpoint);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    if (defined('CURL_HTTP_VERSION_2_0')) {
        curl_setopt($ch, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_2_0);
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: vapid t=$jwt, k=" . $vapidKeys['publicKey'],
        "TTL: 86400",
        "Urgency: high",
        "Content-Length: 0"
    ]);

    $response = curl_exec($ch);
    $httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);

    if ($httpcode !== 201) {
        error_log("sendWebPushNative error HTTP $httpcode for $endpoint: $response (curl: $curlErr)");
        return false;
    }

    return true;
}

/**
 * Helper to fetch unread notification count for a specific user
 */
function getUserUnreadCount($pdo, $userId)
{
    if (!$userId) return 0;
    try {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0");
        $stmt->execute([$userId]);
        return (int) $stmt->fetchColumn();
    } catch (\Throwable $e) {
        return 0;
    }
}

/**
 * Dispatch web push to all siblings (optionally excluding one user)
 */
function sendWebPushToAll($pdo, $excludeUserId = null, $title = 'ChaletWeShare', $body = '', $payloadData = [])
{
    $vapid = getVapidConfig();
    if (!$vapid) {
        return false;
    }

    try {
        if (!empty($excludeUserId)) {
            if (is_array($excludeUserId)) {
                $placeholders = implode(',', array_fill(0, count($excludeUserId), '?'));
                $stmt = $pdo->prepare("SELECT * FROM push_subscriptions WHERE user_id NOT IN ($placeholders)");
                $stmt->execute($excludeUserId);
            } else {
                $stmt = $pdo->prepare("SELECT * FROM push_subscriptions WHERE user_id != ?");
                $stmt->execute([$excludeUserId]);
            }
        } else {
            $stmt = $pdo->query("SELECT * FROM push_subscriptions");
        }
        $subs = $stmt->fetchAll();
        if (empty($subs)) {
            return false;
        }

        if (class_exists('Minishlink\WebPush\WebPush')) {
            $defaultOptions = [
                'TTL' => 86400,
                'urgency' => 'high'
            ];
            $webPush = new WebPush(['VAPID' => $vapid], $defaultOptions, 10);

            // Pre-fetch unread counts for all users
            $unreadCounts = [];
            try {
                $uStmt = $pdo->query("SELECT user_id, COUNT(*) AS cnt FROM notifications WHERE is_read = 0 GROUP BY user_id");
                while ($row = $uStmt->fetch()) {
                    $unreadCounts[$row['user_id']] = (int)$row['cnt'];
                }
            } catch (\Throwable $e) {
                // Table might not exist or error
            }

            foreach ($subs as $sub) {
                $subUserId = $sub['user_id'] ?? null;
                $userPayloadData = $payloadData;
                if (!isset($userPayloadData['unread_count'])) {
                    $userPayloadData['unread_count'] = $unreadCounts[$subUserId] ?? 0;
                }

                $payload = json_encode([
                    'title' => $title,
                    'body' => $body,
                    'data' => $userPayloadData,
                    'tag' => $userPayloadData['tag'] ?? null,
                    'renotify' => $userPayloadData['renotify'] ?? true,
                    'silent' => !empty($userPayloadData['silent']),
                    'timestamp' => time()
                ], JSON_UNESCAPED_UNICODE);

                $subscription = Subscription::create([
                    'endpoint' => $sub['endpoint'],
                    'publicKey' => $sub['p256dh'],
                    'authToken' => $sub['auth'],
                ]);
                $webPush->queueNotification($subscription, $payload);
            }

            $successCount = 0;
            foreach ($webPush->flush() as $report) {
                $endpoint = $report->getRequest()->getUri()->__toString();
                if ($report->isSuccess()) {
                    $successCount++;
                } else {
                    error_log("WebPush sendWebPushToAll failure for $endpoint: " . $report->getReason());
                    if ($report->isSubscriptionExpired()) {
                        $del = $pdo->prepare("DELETE FROM push_subscriptions WHERE endpoint = ?");
                        $del->execute([$endpoint]);
                    }
                }
            }
            return $successCount > 0;
        } else {
            // Fallback native PHP method (wakes up SW)
            $successCount = 0;
            foreach ($subs as $sub) {
                if (sendWebPushNative($sub['endpoint'], $vapid)) {
                    $successCount++;
                }
            }
            return $successCount > 0;
        }
    } catch (\Throwable $e) {
        error_log("sendWebPushToAll error: " . $e->getMessage());
        return false;
    }
}

/**
 * Checks if a push should be throttled/debounced.
 * Returns true if throttled (i.e. sent recently within cooldownSeconds), false if allowed.
 * When not throttled (or updateOnThrottle is false), records the current timestamp.
 */
function checkAndRecordPushThrottle($pdo, $userId, $channelKey, $cooldownSeconds = 300)
{
    if (!$userId || !$channelKey) {
        return false;
    }
    try {
        $stmt = $pdo->prepare("SELECT last_sent_at FROM push_throttle WHERE user_id = ? AND channel_key = ?");
        $stmt->execute([$userId, $channelKey]);
        $lastSent = $stmt->fetchColumn();
        $now = time();

        if ($lastSent) {
            $lastSentTime = strtotime($lastSent);
            if (($now - $lastSentTime) < $cooldownSeconds) {
                return true; // Throttled! Sent within last $cooldownSeconds
            }
        }

        $nowStr = date('Y-m-d H:i:s');
        try {
            // MariaDB / MySQL syntax
            $upd = $pdo->prepare("
                INSERT INTO push_throttle (user_id, channel_key, last_sent_at)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE last_sent_at = VALUES(last_sent_at)
            ");
            $upd->execute([$userId, $channelKey, $nowStr]);
        } catch (\Throwable $e) {
            // SQLite UPSERT syntax fallback
            $sqliteUpd = $pdo->prepare("
                INSERT INTO push_throttle (user_id, channel_key, last_sent_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id, channel_key) DO UPDATE SET last_sent_at = excluded.last_sent_at
            ");
            $sqliteUpd->execute([$userId, $channelKey, $nowStr]);
        }
        return false;
    } catch (\Throwable $e) {
        error_log("checkAndRecordPushThrottle error: " . $e->getMessage());
        return false;
    }
}

/**
 * Dispatch web push to a specific user
 */
function sendWebPushToUser($pdo, $userId, $title = 'ChaletWeShare', $body = '', $payloadData = [])
{
    global $lastWebPushError;
    $vapid = getVapidConfig();
    if (!$vapid) {
        $lastWebPushError = "VAPID-Konfiguration fehlt in config.php";
        return false;
    }

    try {
        $stmt = $pdo->prepare("SELECT * FROM push_subscriptions WHERE user_id = ?");
        $stmt->execute([$userId]);
        $subs = $stmt->fetchAll();
        if (empty($subs)) {
            $lastWebPushError = "Keine Subscription für diesen Benutzer in DB gefunden";
            return false;
        }

        if (class_exists('Minishlink\WebPush\WebPush')) {
            $defaultOptions = [
                'TTL' => 86400,
                'urgency' => 'high'
            ];
            $webPush = new WebPush(['VAPID' => $vapid], $defaultOptions, 10);

            if (!isset($payloadData['unread_count'])) {
                $payloadData['unread_count'] = getUserUnreadCount($pdo, $userId);
            }

            $payload = json_encode([
                'title' => $title,
                'body' => $body,
                'data' => $payloadData,
                'tag' => $payloadData['tag'] ?? null,
                'renotify' => $payloadData['renotify'] ?? true,
                'silent' => !empty($payloadData['silent']),
                'timestamp' => time()
            ], JSON_UNESCAPED_UNICODE);

            foreach ($subs as $sub) {
                $subscription = Subscription::create([
                    'endpoint' => $sub['endpoint'],
                    'publicKey' => $sub['p256dh'],
                    'authToken' => $sub['auth'],
                ]);
                $webPush->queueNotification($subscription, $payload);
            }

            $successCount = 0;
            foreach ($webPush->flush() as $report) {
                $endpoint = $report->getRequest()->getUri()->__toString();
                if ($report->isSuccess()) {
                    $successCount++;
                } else {
                    $lastWebPushError = $report->getReason();
                    error_log("WebPush sendWebPushToUser failure for $endpoint: " . $report->getReason());
                    if ($report->isSubscriptionExpired()) {
                        $del = $pdo->prepare("DELETE FROM push_subscriptions WHERE endpoint = ?");
                        $del->execute([$endpoint]);
                    }
                }
            }
            return $successCount > 0;
        } else {
            $successCount = 0;
            foreach ($subs as $sub) {
                if (sendWebPushNative($sub['endpoint'], $vapid)) {
                    $successCount++;
                }
            }
            if ($successCount === 0) {
                $lastWebPushError = "Native Fallback fehlgeschlagen (HTTP != 201)";
            }
            return $successCount > 0;
        }
    } catch (\Throwable $e) {
        $lastWebPushError = "Exception: " . $e->getMessage();
        error_log("sendWebPushToUser error: " . $e->getMessage());
        return false;
    }
}

// Only handle HTTP requests if invoked directly
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'push.php') {
    switch ($action) {
        case 'status':
            $vapid = getVapidConfig();
            $composerLoaded = class_exists('Minishlink\WebPush\WebPush');
            $stmt = $pdo->query("SELECT COUNT(*) as cnt FROM push_subscriptions");
            $subCount = $stmt->fetchColumn();

            jsonResponse([
                'success' => true,
                'composer_webpush_loaded' => $composerLoaded,
                'vapid_configured' => $vapid ? true : false,
                'openssl_support' => function_exists('openssl_sign'),
                'curl_http2_support' => defined('CURL_HTTP_VERSION_2_0'),
                'total_subscriptions' => $subCount
            ]);
            break;

        case 'get_public_key':
            $vapid = getVapidConfig();
            jsonResponse([
                'success' => true,
                'publicKey' => $vapid ? $vapid['publicKey'] : ''
            ]);
            break;

        case 'subscribe':
            $userId = (int) ($data['user_id'] ?? 0);
            $syncToken = trim($data['sync_token'] ?? '');
            $user = authenticatePushUser($pdo, $userId, $syncToken);
            if (!$user) {
                jsonResponse(['success' => false, 'error' => 'Ungültige Authentifizierung.'], 403);
            }

            $sub = $data['subscription'] ?? null;
            if (!$sub || empty($sub['endpoint'])) {
                jsonResponse(['success' => false, 'error' => 'Keine Subscription-Daten erhalten.'], 400);
            }

            $endpoint = $sub['endpoint'];
            $p256dh = $sub['keys']['p256dh'] ?? '';
            $auth = $sub['keys']['auth'] ?? '';

            // Check if endpoint already registered
            $check = $pdo->prepare("SELECT id FROM push_subscriptions WHERE endpoint = ?");
            $check->execute([$endpoint]);
            $existing = $check->fetch();

            if ($existing) {
                $upd = $pdo->prepare("UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?");
                $upd->execute([$user['id'], $p256dh, $auth, $existing['id']]);
            } else {
                $ins = $pdo->prepare("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)");
                $ins->execute([$user['id'], $endpoint, $p256dh, $auth]);
            }

            jsonResponse(['success' => true, 'message' => 'Subscription gespeichert.']);
            break;

        case 'unsubscribe':
            $userId = (int) ($data['user_id'] ?? 0);
            $syncToken = trim($data['sync_token'] ?? '');
            $user = authenticatePushUser($pdo, $userId, $syncToken);
            if (!$user) {
                jsonResponse(['success' => false, 'error' => 'Ungültige Authentifizierung.'], 403);
            }

            $endpoint = $data['endpoint'] ?? '';
            if ($endpoint) {
                $del = $pdo->prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?");
                $del->execute([$user['id'], $endpoint]);
            } else {
                $del = $pdo->prepare("DELETE FROM push_subscriptions WHERE user_id = ?");
                $del->execute([$user['id']]);
            }

            jsonResponse(['success' => true, 'message' => 'Subscription entfernt.']);
            break;

        case 'test_push':
            $userId = (int) ($data['user_id'] ?? 0);
            $syncToken = trim($data['sync_token'] ?? '');
            $user = authenticatePushUser($pdo, $userId, $syncToken);
            if (!$user) {
                jsonResponse(['success' => false, 'error' => 'Ungültige Authentifizierung.'], 403);
            }

            $stmt = $pdo->prepare("SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?");
            $stmt->execute([$user['id']]);
            $subCount = (int) $stmt->fetchColumn();
            if ($subCount === 0) {
                jsonResponse([
                    'success' => false,
                    'error' => 'Keine aktive Push-Subscription in der Datenbank gefunden. Bitte deaktiviere die Mitteilungen im Profil kurz und aktiviere sie erneut.'
                ], 400);
            }

            global $lastWebPushError;
            $sent = sendWebPushToUser($pdo, $user['id'], 'ChaletWeShare Test', 'Test-Mitteilung erfolgreich empfangen!', ['type' => 'test']);
            if (!$sent) {
                jsonResponse([
                    'success' => false,
                    'error' => 'Push-Server Fehler: ' . ($lastWebPushError ?? 'Unbekannter Fehler / Keine Rückmeldung')
                ], 500);
            }

            jsonResponse(['success' => true, 'sent' => true]);
            break;

        default:
            jsonResponse(['success' => false, 'error' => 'Ungültige Aktion.'], 400);
            break;
    }
}