<?php
/**
 * ChaletWeShare — In-App Notifications API
 */

require_once __DIR__ . '/db.php';

$pdo = getDbConnection();
$data = getJsonInput();
$action = $data['action'] ?? '';

$userId = (int) ($data['user_id'] ?? 0);
$syncToken = trim($data['sync_token'] ?? '');

$user = authenticateUserById($pdo, $userId, $syncToken);
if (!$user) {
    jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 403);
}

// Opportunistic garbage collection: automatically purge notifications older than 14 days
try {
    $pdo->exec("DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL 14 DAY)");
} catch (\Throwable $e) {
    // Non-critical
}

switch ($action) {
    case 'count_unread':
        $stmt = $pdo->prepare("SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = ? AND is_read = 0");
        $stmt->execute([$user['id']]);
        $row = $stmt->fetch();
        jsonResponse([
            'success' => true,
            'count' => (int) ($row['unread_count'] ?? 0)
        ]);
        break;

    case 'list':
        $stmt = $pdo->prepare("
            SELECT id, type, message, is_read, related_reservation_id, action_payload, created_at
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 30
        ");
        $stmt->execute([$user['id']]);
        $items = $stmt->fetchAll();

        $formatted = array_map(function($n) {
            // Strip any redundant leading emojis (e.g. 🛠️, 🍂, 🧹, etc.)
            $msg = preg_replace('/^[\x{1F300}-\x{1FAD6}\x{2000}-\x{3299}\x{FE0F}\s]+/u', '', $n['message']);
            
            $payload = null;
            if (!empty($n['action_payload'])) {
                $payload = json_decode($n['action_payload'], true);
            }

            return [
                'id' => (int) $n['id'],
                'type' => $n['type'],
                'message' => !empty(trim($msg)) ? trim($msg) : $n['message'],
                'is_read' => (bool) $n['is_read'],
                'related_reservation_id' => $n['related_reservation_id'] ? (int) $n['related_reservation_id'] : null,
                'action_payload' => $payload,
                'created_at' => $n['created_at']
            ];
        }, $items);

        jsonResponse([
            'success' => true,
            'notifications' => $formatted
        ]);
        break;

    case 'mark_read':
        $ids = $data['notification_ids'] ?? [];
        if (!is_array($ids) || empty($ids)) {
            jsonResponse(['success' => true, 'updated' => 0]);
        }
        $inClause = implode(',', array_fill(0, count($ids), '?'));
        $params = array_merge([$user['id']], array_map('intval', $ids));
        $stmt = $pdo->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN ($inClause)");
        $stmt->execute($params);

        jsonResponse([
            'success' => true,
            'updated' => $stmt->rowCount()
        ]);
        break;

    case 'mark_all_read':
        $stmt = $pdo->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0");
        $stmt->execute([$user['id']]);
        jsonResponse([
            'success' => true,
            'updated' => $stmt->rowCount()
        ]);
        break;

    case 'clear_read':
        $stmt = $pdo->prepare("DELETE FROM notifications WHERE user_id = ? AND is_read = 1");
        $stmt->execute([$user['id']]);
        jsonResponse([
            'success' => true,
            'deleted' => $stmt->rowCount()
        ]);
        break;

    default:
        jsonResponse(['success' => false, 'error' => 'Ungültige Aktion.'], 400);
        break;
}
