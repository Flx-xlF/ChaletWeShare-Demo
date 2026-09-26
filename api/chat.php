<?php
/**
 * ChaletWeShare — Micro-Chat API for Conflict Discussions & Maintenance Overlap Coordination
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/push.php';

date_default_timezone_set('Europe/Zurich');

$input = getJsonInput();
$action = $input['action'] ?? ($_GET['action'] ?? '');

$pdo = getDbConnection();

switch ($action) {
    case 'list':
        $profileId = $input['profile_id'] ?? ($_GET['profile_id'] ?? '');
        $syncToken = $input['sync_token'] ?? ($_GET['sync_token'] ?? '');
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $resId = (int) ($input['reservation_id'] ?? ($_GET['reservation_id'] ?? 0));
        $maintId = (int) ($input['maintenance_id'] ?? ($_GET['maintenance_id'] ?? 0));

        if (!$resId && !$maintId) {
            jsonResponse(['success' => false, 'error' => 'Reservations-ID oder Unterhalts-ID erforderlich.'], 400);
        }

        if ($resId) {
            $stmt = $pdo->prepare("
                SELECT m.id, m.reservation_id, m.maintenance_id, m.user_id, m.message, m.created_at,
                       u.name as user_name, u.avatar as user_avatar, u.profile_id
                FROM chat_messages m
                JOIN users u ON m.user_id = u.id
                WHERE m.reservation_id = ?
                ORDER BY m.created_at ASC
            ");
            $stmt->execute([$resId]);
        } else {
            $stmt = $pdo->prepare("
                SELECT m.id, m.reservation_id, m.maintenance_id, m.user_id, m.message, m.created_at,
                       u.name as user_name, u.avatar as user_avatar, u.profile_id
                FROM chat_messages m
                JOIN users u ON m.user_id = u.id
                WHERE m.maintenance_id = ?
                ORDER BY m.created_at ASC
            ");
            $stmt->execute([$maintId]);
        }
        $messages = $stmt->fetchAll();

        // Also fetch overlap approvals if maintenance_id
        $overlapApprovals = [];
        if ($maintId) {
            try {
                $apprStmt = $pdo->prepare("
                    SELECT a.id, a.maintenance_id, a.allowed_user_id, a.granted_by_user_id, a.created_at,
                           u.name as allowed_user_name, u.avatar as allowed_user_avatar
                    FROM maintenance_overlap_approvals a
                    JOIN users u ON a.allowed_user_id = u.id
                    WHERE a.maintenance_id = ?
                ");
                $apprStmt->execute([$maintId]);
                $overlapApprovals = $apprStmt->fetchAll();
            } catch (\Throwable $e) {}
        }

        jsonResponse([
            'success' => true,
            'messages' => $messages,
            'overlap_approvals' => $overlapApprovals
        ]);
        break;

    case 'my_active_chats':
        $profileId = $input['profile_id'] ?? ($_GET['profile_id'] ?? '');
        $syncToken = $input['sync_token'] ?? ($_GET['sync_token'] ?? '');
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $userId = (int) $user['id'];
        $today = date('Y-m-d');
        $chats = [];

        // 1. Reservations where current user is involved:
        // - User is the reservation owner
        // - OR User placed a veto on this reservation
        // - OR User sent a chat message in this reservation thread
        // - AND reservation is not cancelled
        // - AND conflict is not resolved
        // - AND chat has not been dismissed/closed by user or owner
        $resStmt = $pdo->prepare("
            SELECT r.id as target_id, 'reservation' as type, r.date_start, r.date_end, r.status,
                   u.name as owner_name, u.avatar as owner_avatar,
                   m.message as latest_message, m.created_at as latest_message_time,
                   mu.name as latest_message_author, mu.avatar as latest_message_avatar,
                   (SELECT COUNT(*) FROM chat_messages WHERE reservation_id = r.id) as message_count
            FROM reservations r
            JOIN users u ON r.user_id = u.id
            JOIN chat_messages m ON m.id = (
                SELECT id FROM chat_messages WHERE reservation_id = r.id ORDER BY created_at DESC LIMIT 1
            )
            JOIN users mu ON m.user_id = mu.id
            WHERE r.date_end >= ?
              AND r.status != 'cancelled'
              AND NOT EXISTS (SELECT 1 FROM conflict_resolutions cr WHERE cr.reservation_id = r.id)
              AND (
                  r.user_id = ?
                  OR EXISTS (SELECT 1 FROM vetoes v WHERE v.reservation_id = r.id AND v.user_id = ?)
                  OR EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.reservation_id = r.id AND cm.user_id = ?)
              )
              AND NOT EXISTS (
                  SELECT 1 FROM chat_dismissals cd 
                  WHERE (cd.user_id = ? OR cd.scope = 'all')
                    AND cd.reservation_id = r.id
                    AND cd.created_at >= m.created_at
              )
            ORDER BY m.created_at DESC
        ");
        $resStmt->execute([$today, $userId, $userId, $userId, $userId]);
        foreach ($resStmt->fetchAll() as $row) {
            $chats[] = $row;
        }

        // 2. Maintenance Blocks where current user is involved:
        // - User is the maintenance creator
        // - OR User has been granted or granted overlap approval for this maintenance block
        // - OR User sent a chat message in this maintenance thread
        // - AND chat has not been dismissed/closed by user or owner
        $maintStmt = $pdo->prepare("
            SELECT mb.id as target_id, 'maintenance' as type, mb.date_start, mb.date_end, mb.reason,
                   u.name as owner_name, u.avatar as owner_avatar,
                   m.message as latest_message, m.created_at as latest_message_time,
                   mu.name as latest_message_author, mu.avatar as latest_message_avatar,
                   (SELECT COUNT(*) FROM chat_messages WHERE maintenance_id = mb.id) as message_count
            FROM maintenance_blocks mb
            JOIN users u ON mb.user_id = u.id
            JOIN chat_messages m ON m.id = (
                SELECT id FROM chat_messages WHERE maintenance_id = mb.id ORDER BY created_at DESC LIMIT 1
            )
            JOIN users mu ON m.user_id = mu.id
            WHERE mb.date_end >= ?
              AND (
                  mb.user_id = ?
                  OR EXISTS (
                      SELECT 1 FROM maintenance_overlap_approvals moa 
                      WHERE moa.maintenance_id = mb.id 
                        AND (moa.allowed_user_id = ? OR moa.granted_by_user_id = ?)
                  )
                  OR EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.maintenance_id = mb.id AND cm.user_id = ?)
              )
              AND NOT EXISTS (
                  SELECT 1 FROM chat_dismissals cd 
                  WHERE (cd.user_id = ? OR cd.scope = 'all')
                    AND cd.maintenance_id = mb.id
                    AND cd.created_at >= m.created_at
              )
            ORDER BY m.created_at DESC
        ");
        $maintStmt->execute([$today, $userId, $userId, $userId, $userId, $userId]);
        foreach ($maintStmt->fetchAll() as $row) {
            $chats[] = $row;
        }

        // Sort combined array by latest_message_time DESC
        usort($chats, function($a, $b) {
            return strtotime($b['latest_message_time']) - strtotime($a['latest_message_time']);
        });

        jsonResponse([
            'success' => true,
            'chats' => $chats
        ]);
        break;

    case 'dismiss_chat':
        $profileId = $input['profile_id'] ?? ($_GET['profile_id'] ?? '');
        $syncToken = $input['sync_token'] ?? ($_GET['sync_token'] ?? '');
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $resId = !empty($input['reservation_id']) ? (int)$input['reservation_id'] : null;
        $maintId = !empty($input['maintenance_id']) ? (int)$input['maintenance_id'] : null;
        $scope = ($input['scope'] ?? 'user') === 'all' ? 'all' : 'user';

        if (!$resId && !$maintId) {
            jsonResponse(['success' => false, 'error' => 'Reservations-ID oder Unterhalts-ID erforderlich.'], 400);
        }

        // If scope is 'all', check if user is the owner
        if ($scope === 'all') {
            $isOwner = false;
            if ($resId) {
                $chk = $pdo->prepare("SELECT user_id FROM reservations WHERE id = ?");
                $chk->execute([$resId]);
                $isOwner = ((int)$chk->fetchColumn() === (int)$user['id']);
            } elseif ($maintId) {
                $chk = $pdo->prepare("SELECT user_id FROM maintenance_blocks WHERE id = ?");
                $chk->execute([$maintId]);
                $isOwner = ((int)$chk->fetchColumn() === (int)$user['id']);
            }
            if (!$isOwner) {
                $scope = 'user';
            }
        }

        $now = (new DateTime('now', new DateTimeZone('Europe/Zurich')))->format('Y-m-d H:i:s');

        $pdo->beginTransaction();
        try {
            if ($resId) {
                if ($scope === 'all') {
                    $del = $pdo->prepare("DELETE FROM chat_dismissals WHERE reservation_id = ?");
                    $del->execute([$resId]);
                } else {
                    $del = $pdo->prepare("DELETE FROM chat_dismissals WHERE user_id = ? AND reservation_id = ?");
                    $del->execute([$user['id'], $resId]);
                }
                $ins = $pdo->prepare("INSERT INTO chat_dismissals (user_id, reservation_id, scope, created_at) VALUES (?, ?, ?, ?)");
                $ins->execute([$user['id'], $resId, $scope, $now]);
            } else {
                if ($scope === 'all') {
                    $del = $pdo->prepare("DELETE FROM chat_dismissals WHERE maintenance_id = ?");
                    $del->execute([$maintId]);
                } else {
                    $del = $pdo->prepare("DELETE FROM chat_dismissals WHERE user_id = ? AND maintenance_id = ?");
                    $del->execute([$user['id'], $maintId]);
                }
                $ins = $pdo->prepare("INSERT INTO chat_dismissals (user_id, maintenance_id, scope, created_at) VALUES (?, ?, ?, ?)");
                $ins->execute([$user['id'], $maintId, $scope, $now]);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            jsonResponse(['success' => false, 'error' => 'Fehler beim Schliessen des Chats.'], 500);
        }

        jsonResponse([
            'success' => true,
            'message' => $scope === 'all' ? 'Chat für alle geschlossen.' : 'Chat erfolgreich ausgeblendet.'
        ]);
        break;

    case 'send':
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $resId = (int) ($input['reservation_id'] ?? 0);
        $maintId = (int) ($input['maintenance_id'] ?? 0);
        $message = trim($input['message'] ?? '');

        if ((!$resId && !$maintId) || empty($message)) {
            jsonResponse(['success' => false, 'error' => 'Nachricht und ID erforderlich.'], 400);
        }

        $now = (new DateTime('now', new DateTimeZone('Europe/Zurich')))->format('Y-m-d H:i:s');

        if ($resId) {
            $stmt = $pdo->prepare("
                INSERT INTO chat_messages (reservation_id, user_id, message, created_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ");
            $stmt->execute([$resId, $user['id'], $message]);
            $msgId = $pdo->lastInsertId();

            // Notify other participants (reservation owner and vetoers)
            try {
                $partStmt = $pdo->prepare("
                    SELECT DISTINCT user_id 
                    FROM (
                        SELECT user_id FROM reservations WHERE id = ?
                        UNION
                        SELECT user_id FROM vetoes WHERE reservation_id = ?
                    ) t 
                    WHERE user_id != ?
                ");
                $partStmt->execute([$resId, $resId, $user['id']]);
                $recipients = $partStmt->fetchAll();

                $chatNotifMsg = "💬 {$user['name']}: " . (mb_strlen($message) > 60 ? mb_substr($message, 0, 57) . '...' : $message);
                $channelKey = "chat_res_{$resId}";
                $pushTag = "chat-res-{$resId}";

                $resDate = null;
                try {
                    $rStmt = $pdo->prepare("SELECT date_start FROM reservations WHERE id = ?");
                    $rStmt->execute([$resId]);
                    $rRow = $rStmt->fetch();
                    if ($rRow) $resDate = $rRow['date_start'];
                } catch (Exception $e) {}

                // Smart Anti-Spam: Chat messages are handled natively by the dedicated ChatHubBadge.
                // We do NOT insert redundant records into the general notifications table (Bell).
                // For Web Push, we throttle alerts (5 min cooldown) so rapid messaging updates silently on device.
                foreach ($recipients as $rec) {
                    $isThrottled = checkAndRecordPushThrottle($pdo, $rec['user_id'], $channelKey, 300);
                    sendWebPushToUser(
                        $pdo,
                        $rec['user_id'],
                        'ChaletWeShare: Neue Nachricht',
                        $chatNotifMsg,
                        [
                            'type' => 'chat_message',
                            'reservation_id' => $resId,
                            'date' => $resDate,
                            'tag' => $pushTag,
                            'renotify' => !$isThrottled,
                            'silent' => $isThrottled
                        ]
                    );
                }
            } catch (Exception $e) {
                error_log("Chat notification error: " . $e->getMessage());
            }

            jsonResponse([
                'success' => true,
                'message' => [
                    'id' => (int) $msgId,
                    'reservation_id' => $resId,
                    'user_id' => (int) $user['id'],
                    'user_name' => $user['name'],
                    'user_avatar' => $user['avatar'],
                    'message' => $message,
                    'created_at' => $now
                ]
            ], 201);
        } else {
            $stmt = $pdo->prepare("
                INSERT INTO chat_messages (maintenance_id, user_id, message, created_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ");
            $stmt->execute([$maintId, $user['id'], $message]);
            $msgId = $pdo->lastInsertId();

            // Notify maintenance owner & any prior participants
            try {
                $partStmt = $pdo->prepare("
                    SELECT DISTINCT user_id 
                    FROM (
                        SELECT user_id FROM maintenance_blocks WHERE id = ?
                        UNION
                        SELECT user_id FROM chat_messages WHERE maintenance_id = ?
                    ) t 
                    WHERE user_id != ?
                ");
                $partStmt->execute([$maintId, $maintId, $user['id']]);
                $recipients = $partStmt->fetchAll();

                $chatNotifMsg = "💬 {$user['name']} (Unterhalt): " . (mb_strlen($message) > 60 ? mb_substr($message, 0, 57) . '...' : $message);
                $channelKey = "chat_maint_{$maintId}";
                $pushTag = "chat-maint-{$maintId}";

                $maintDate = null;
                try {
                    $mStmt = $pdo->prepare("SELECT date_start FROM maintenance_blocks WHERE id = ?");
                    $mStmt->execute([$maintId]);
                    $mRow = $mStmt->fetch();
                    if ($mRow) $maintDate = $mRow['date_start'];
                } catch (Exception $e) {}

                // Smart Anti-Spam: Chat messages are handled natively by the dedicated ChatHubBadge.
                // We do NOT insert redundant records into the general notifications table (Bell).
                // For Web Push, we throttle alerts (5 min cooldown) so rapid messaging updates silently on device.
                foreach ($recipients as $rec) {
                    $isThrottled = checkAndRecordPushThrottle($pdo, $rec['user_id'], $channelKey, 300);
                    sendWebPushToUser(
                        $pdo,
                        $rec['user_id'],
                        'ChaletWeShare: Unterhalt-Absprache',
                        $chatNotifMsg,
                        [
                            'type' => 'chat_message',
                            'maintenance_id' => $maintId,
                            'date' => $maintDate,
                            'tag' => $pushTag,
                            'renotify' => !$isThrottled,
                            'silent' => $isThrottled
                        ]
                    );
                }
            } catch (Exception $e) {
                error_log("Maintenance chat notification error: " . $e->getMessage());
            }

            jsonResponse([
                'success' => true,
                'message' => [
                    'id' => (int) $msgId,
                    'maintenance_id' => $maintId,
                    'user_id' => (int) $user['id'],
                    'user_name' => $user['name'],
                    'user_avatar' => $user['avatar'],
                    'message' => $message,
                    'created_at' => $now
                ]
            ], 201);
        }
        break;

    case 'allow_maintenance_overlap':
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $maintId = (int) ($input['maintenance_id'] ?? 0);
        $allowedUserId = (int) ($input['allowed_user_id'] ?? 0);

        if (!$maintId || !$allowedUserId) {
            jsonResponse(['success' => false, 'error' => 'Unterhalts-ID und Ziel-Benutzer erforderlich.'], 400);
        }

        // Validate maintenance exists and user is owner
        $mStmt = $pdo->prepare("SELECT id, user_id, date_start, date_end, reason FROM maintenance_blocks WHERE id = ?");
        $mStmt->execute([$maintId]);
        $mBlock = $mStmt->fetch();
        if (!$mBlock) {
            jsonResponse(['success' => false, 'error' => 'Unterhalt nicht gefunden.'], 404);
        }
        if ((int)$mBlock['user_id'] !== (int)$user['id']) {
            jsonResponse(['success' => false, 'error' => 'Nur der Ersteller des Unterhalts kann Mitnutzung erlauben.'], 403);
        }

        // Target user
        $targetUserStmt = $pdo->prepare("SELECT id, name FROM users WHERE id = ?");
        $targetUserStmt->execute([$allowedUserId]);
        $targetUser = $targetUserStmt->fetch();
        if (!$targetUser) {
            jsonResponse(['success' => false, 'error' => 'Ziel-Benutzer nicht gefunden.'], 404);
        }

        // Insert approval
        try {
            $insAppr = $pdo->prepare("
                INSERT INTO maintenance_overlap_approvals (maintenance_id, allowed_user_id, granted_by_user_id, created_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ");
            $insAppr->execute([$maintId, $allowedUserId, $user['id']]);
        } catch (\Throwable $e) {
            try {
                $updAppr = $pdo->prepare("
                    UPDATE maintenance_overlap_approvals 
                    SET granted_by_user_id = ?, created_at = CURRENT_TIMESTAMP
                    WHERE maintenance_id = ? AND allowed_user_id = ?
                ");
                $updAppr->execute([$user['id'], $maintId, $allowedUserId]);
            } catch (\Throwable $e2) {}
        }

        $now = (new DateTime('now', new DateTimeZone('Europe/Zurich')))->format('Y-m-d H:i:s');
        $sysMsg = "🤝 {$user['name']} hat die Mitnutzung (Doppelnutzung) für {$targetUser['name']} offiziell erlaubt.";
        $chatStmt = $pdo->prepare("INSERT INTO chat_messages (maintenance_id, user_id, message, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)");
        $chatStmt->execute([$maintId, $user['id'], $sysMsg]);
        $msgId = $pdo->lastInsertId();

        // Push to allowed sibling
        $pushMsg = "🤝 {$user['name']} hat dir die Doppelnutzung während des Unterhalts ({$mBlock['reason']}, {$mBlock['date_start']}) erlaubt!";
        try {
            $actionPayload = json_encode([
                'maintenance_id' => (int) $maintId,
                'date' => $mBlock['date_start'],
                'type' => 'overlap_approval'
            ]);
            $notifIns = $pdo->prepare("INSERT INTO notifications (user_id, type, message, action_payload, created_at) VALUES (?, 'overlap_approval', ?, ?, ?)");
            $notifIns->execute([$allowedUserId, $pushMsg, $actionPayload, $now]);
            sendWebPushToUser($pdo, $allowedUserId, 'Mitnutzung erlaubt! 🤝', $pushMsg, [
                'maintenance_id' => (int) $maintId,
                'date' => $mBlock['date_start'],
                'type' => 'overlap_approval'
            ]);
        } catch (Exception $e) {}

        jsonResponse([
            'success' => true,
            'message' => [
                'id' => (int)$msgId,
                'maintenance_id' => $maintId,
                'user_id' => (int)$user['id'],
                'user_name' => $user['name'],
                'user_avatar' => $user['avatar'],
                'message' => $sysMsg,
                'created_at' => $now
            ]
        ]);
        break;

    default:
        jsonResponse(['success' => false, 'error' => 'Unbekannte Aktion.'], 400);
        break;
}
