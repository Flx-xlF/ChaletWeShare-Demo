<?php
/**
 * Chalet Zahler — Handover Notes API
 * Manages handover notes from current guests to the next reservation (garbage, missing items, broken items, custom notes).
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/push.php';

$pdo = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    jsonResponse(['status' => 'ok']);
}

$action = $_GET['action'] ?? null;
$input = getJsonInput();
if (!$action) {
    $action = $input['action'] ?? null;
}

switch ($action) {
    case 'create':
        handleCreateNote($pdo, $input);
        break;
    case 'update':
        handleUpdateNote($pdo, $input);
        break;
    case 'list_for_reservation':
        handleListNotes($pdo);
        break;
    case 'check_prompt':
        handleCheckPrompt($pdo, $input);
        break;
    case 'get_arrival_briefing':
        handleGetArrivalBriefing($pdo, $input);
        break;
    case 'delete':
        handleDeleteNote($pdo, $input);
        break;
    default:
        jsonResponse(['error' => 'Ungültige Aktion.'], 400);
}


function handleCreateNote(PDO $pdo, $input) {
    $profileId = $input['profile_id'] ?? null;
    $syncToken = $input['sync_token'] ?? null;
    $reservationId = $input['reservation_id'] ?? null;
    $category = $input['category'] ?? 'custom';
    $message = trim($input['message'] ?? '');

    $user = authenticateUser($pdo, $profileId, $syncToken);
    if (!$user) {
        jsonResponse(['error' => 'Nicht autorisiert.'], 401);
    }

    if (!$message) {
        jsonResponse(['error' => 'Nachricht darf nicht leer sein.'], 400);
    }

    // Check reservation
    $resStmt = $pdo->prepare("SELECT * FROM reservations WHERE id = :id LIMIT 1");
    $resStmt->execute([':id' => $reservationId]);
    $currentRes = $resStmt->fetch();
    if (!$currentRes) {
        jsonResponse(['error' => 'Reservation nicht gefunden.'], 404);
    }

    // Find the next upcoming reservation
    $nextStmt = $pdo->prepare("
        SELECT r.*, u.name as user_name, u.avatar as user_avatar 
        FROM reservations r
        JOIN users u ON r.user_id = u.id
        WHERE r.status IN ('booked', 'pending') 
          AND r.date_start >= :cur_end
          AND r.id != :cur_id
        ORDER BY r.date_start ASC 
        LIMIT 1
    ");
    $nextStmt->execute([
        ':cur_end' => $currentRes['date_end'],
        ':cur_id' => $currentRes['id']
    ]);
    $nextRes = $nextStmt->fetch();
    $targetResId = $nextRes ? $nextRes['id'] : null;

    // Insert handover note
    $insStmt = $pdo->prepare("
        INSERT INTO handover_notes (reservation_id, author_user_id, target_reservation_id, category, message, created_at)
        VALUES (:res_id, :author_id, :target_id, :cat, :msg, :created)
    ");
    $now = date('Y-m-d H:i:s');
    $insStmt->execute([
        ':res_id' => $reservationId,
        ':author_id' => $user['id'],
        ':target_id' => $targetResId,
        ':cat' => $category,
        ':msg' => $message,
        ':created' => $now
    ]);
    $noteId = $pdo->lastInsertId();

    // Map category to icon & label
    $catLabels = [
        'garbage' => '🗑️ Kehricht/Abfall',
        'missing' => '🔍 Fehlendes',
        'broken' => '⚠️ Defekt/Reparatur',
        'custom' => '📋 Notiz'
    ];
    $catLabel = $catLabels[$category] ?? '📋 Notiz';

    // Dispatch notification to next reservation owner if present
    if ($nextRes) {
        $notifMsg = "📝 {$user['name']} hat eine Übergabe-Notiz ({$catLabel}) für deinen kommenden Aufenthalt hinterlassen: \"{$message}\"";
        $notifStmt = $pdo->prepare("
            INSERT INTO notifications (user_id, type, message, related_reservation_id, created_at)
            VALUES (:uid, 'handover_note', :msg, :rel_id, :now)
        ");
        $notifStmt->execute([
            ':uid' => $nextRes['user_id'],
            ':msg' => $notifMsg,
            ':rel_id' => $nextRes['id'],
            ':now' => $now
        ]);

        // Web push to next user
        sendWebPushToUser(
            $pdo,
            $nextRes['user_id'],
            'Chalet Zahler — Übergabe-Notiz',
            $notifMsg,
            ['reservation_id' => $nextRes['id']]
        );
    }

    jsonResponse([
        'success' => true,
        'note' => [
            'id' => (int)$noteId,
            'reservation_id' => (int)$reservationId,
            'author_user_id' => (int)$user['id'],
            'author_name' => $user['name'],
            'author_avatar' => $user['avatar'],
            'target_reservation_id' => $targetResId ? (int)$targetResId : null,
            'target_user_name' => $nextRes ? $nextRes['user_name'] : null,
            'category' => $category,
            'message' => $message,
            'created_at' => $now
        ]
    ]);
}

function handleListNotes(PDO $pdo) {
    requireGateOrUser($pdo);
    $reservationId = $_GET['reservation_id'] ?? null;
    if (!$reservationId) {
        jsonResponse(['error' => 'reservation_id erforderlich.'], 400);
    }

    $stmt = $pdo->prepare("
        SELECT hn.*, 
               u.name as author_name, 
               u.avatar as author_avatar
        FROM handover_notes hn
        JOIN users u ON hn.author_user_id = u.id
        WHERE hn.target_reservation_id = :res_id 
           OR hn.reservation_id = :res_id
        ORDER BY hn.created_at DESC
    ");
    $stmt->execute([':res_id' => $reservationId]);
    $notes = $stmt->fetchAll();

    jsonResponse([
        'success' => true,
        'notes' => $notes
    ]);
}

function handleCheckPrompt(PDO $pdo, $input = []) {
    $profileId = $input['profile_id'] ?? null;
    $syncToken = $input['sync_token'] ?? null;

    $user = authenticateUser($pdo, $profileId, $syncToken);
    if (!$user) {
        jsonResponse(['success' => false, 'should_prompt' => false]);
    }

    $today = date('Y-m-d');
    $tomorrow = date('Y-m-d', strtotime('+1 day'));

    // Look for active reservation ending today or tomorrow that has already started
    $stmt = $pdo->prepare("
        SELECT * FROM reservations 
        WHERE user_id = :uid 
          AND status IN ('booked', 'pending', 'shared')
          AND date_start <= :today
          AND date_end IN (:today, :tomorrow)
        ORDER BY date_end ASC 
        LIMIT 1
    ");
    $stmt->execute([
        ':uid' => $user['id'],
        ':today' => $today,
        ':tomorrow' => $tomorrow
    ]);
    $activeRes = $stmt->fetch();

    if (!$activeRes) {
        jsonResponse(['success' => true, 'should_prompt' => false]);
    }

    // Check if user already submitted a note for this stay
    $noteStmt = $pdo->prepare("SELECT COUNT(*) FROM handover_notes WHERE reservation_id = :res_id");
    $noteStmt->execute([':res_id' => $activeRes['id']]);
    $hasNote = (int)$noteStmt->fetchColumn() > 0;

    jsonResponse([
        'success' => true,
        'should_prompt' => !$hasNote,
        'reservation' => $activeRes
    ]);
}

function handleDeleteNote(PDO $pdo, $input) {
    $profileId = $input['profile_id'] ?? null;
    $syncToken = $input['sync_token'] ?? null;
    $noteId = $input['note_id'] ?? null;

    $user = authenticateUser($pdo, $profileId, $syncToken);
    if (!$user) {
        jsonResponse(['error' => 'Nicht autorisiert.'], 401);
    }

    // Find note first to clean up unread in-app notification for the target reservation
    $findStmt = $pdo->prepare("SELECT target_reservation_id FROM handover_notes WHERE id = :id AND author_user_id = :uid");
    $findStmt->execute([':id' => $noteId, ':uid' => $user['id']]);
    $note = $findStmt->fetch();

    if ($note && !empty($note['target_reservation_id'])) {
        $delNotifStmt = $pdo->prepare("
            DELETE FROM notifications 
            WHERE type = 'handover_note' 
              AND related_reservation_id = :target_id 
              AND is_read = 0
        ");
        $delNotifStmt->execute([':target_id' => $note['target_reservation_id']]);
    }

    $stmt = $pdo->prepare("DELETE FROM handover_notes WHERE id = :id AND author_user_id = :uid");
    $stmt->execute([':id' => $noteId, ':uid' => $user['id']]);

    jsonResponse(['success' => true]);
}

function handleUpdateNote(PDO $pdo, $input) {
    $profileId = $input['profile_id'] ?? null;
    $syncToken = $input['sync_token'] ?? null;
    $noteId = $input['note_id'] ?? null;
    $category = $input['category'] ?? null;
    $message = isset($input['message']) ? trim($input['message']) : null;

    $user = authenticateUser($pdo, $profileId, $syncToken);
    if (!$user) {
        jsonResponse(['error' => 'Nicht autorisiert.'], 401);
    }

    if (!$noteId) {
        jsonResponse(['error' => 'note_id erforderlich.'], 400);
    }

    if ($message === null || $message === '') {
        jsonResponse(['error' => 'Nachricht darf nicht leer sein.'], 400);
    }

    // Verify ownership
    $checkStmt = $pdo->prepare("SELECT * FROM handover_notes WHERE id = :id AND author_user_id = :uid LIMIT 1");
    $checkStmt->execute([':id' => $noteId, ':uid' => $user['id']]);
    $existing = $checkStmt->fetch();
    if (!$existing) {
        jsonResponse(['error' => 'Notiz nicht gefunden oder keine Berechtigung.'], 403);
    }

    $allowedCategories = ['garbage', 'missing', 'broken', 'custom'];
    $newCategory = in_array($category, $allowedCategories, true) ? $category : $existing['category'];

    $updateStmt = $pdo->prepare("
        UPDATE handover_notes
        SET category = :cat, message = :msg
        WHERE id = :id AND author_user_id = :uid
    ");
    $updateStmt->execute([
        ':cat' => $newCategory,
        ':msg' => $message,
        ':id' => $noteId,
        ':uid' => $user['id']
    ]);

    jsonResponse([
        'success' => true,
        'note' => [
            'id' => (int)$noteId,
            'reservation_id' => (int)$existing['reservation_id'],
            'author_user_id' => (int)$existing['author_user_id'],
            'author_name' => $user['name'],
            'author_avatar' => $user['avatar'],
            'target_reservation_id' => $existing['target_reservation_id'] ? (int)$existing['target_reservation_id'] : null,
            'category' => $newCategory,
            'message' => $message,
            'created_at' => $existing['created_at']
        ]
    ]);
}


function handleGetArrivalBriefing(PDO $pdo, $input = []) {
    $profileId = $input['profile_id'] ?? null;
    $syncToken = $input['sync_token'] ?? null;

    $user = authenticateUser($pdo, $profileId, $syncToken);
    if (!$user) {
        jsonResponse(['success' => false, 'has_arrival' => false]);
    }

    $tz = new DateTimeZone('Europe/Zurich');
    $now = new DateTime('now', $tz);
    $today = $now->format('Y-m-d');
    $yesterday = (clone $now)->modify('-24 hours')->format('Y-m-d');
    $in48h = (clone $now)->modify('+48 hours')->format('Y-m-d');

    // Find reservation for this user with check-in between yesterday and in48h
    $stmt = $pdo->prepare("
        SELECT r.*, u.name as user_name, u.avatar as user_avatar
        FROM reservations r
        JOIN users u ON r.user_id = u.id
        WHERE r.user_id = :uid
          AND r.status IN ('booked', 'pending', 'shared')
          AND r.date_start >= :yesterday
          AND r.date_start <= :in48h
          AND r.date_end >= :today
        ORDER BY r.date_start ASC
        LIMIT 1
    ");
    $stmt->execute([
        ':uid' => $user['id'],
        ':yesterday' => $yesterday,
        ':today' => $today,
        ':in48h' => $in48h
    ]);
    $res = $stmt->fetch();

    if (!$res) {
        jsonResponse(['success' => true, 'has_arrival' => false]);
    }

    // Check-in datetime (assumed 15:00 on date_start)
    $checkinDt = new DateTime($res['date_start'] . ' 15:00:00', $tz);
    $diffSecs = $checkinDt->getTimestamp() - $now->getTimestamp();
    $diffHours = $diffSecs / 3600.0;

    // Only show arrival briefing between 48 hours before check-in and 24 hours after check-in
    if ($diffHours < -24.0 || $diffHours > 48.0) {
        jsonResponse(['success' => true, 'has_arrival' => false]);
    }

    $isOngoing = ($now >= $checkinDt && $res['date_end'] >= $today);
    $remainingSecs = max(0, $diffSecs);
    $hoursUntil = (int)floor($remainingSecs / 3600);
    $minutesUntil = (int)floor(($remainingSecs % 3600) / 60);

    // Find previous reservation ending on or before this check-in date
    $prevStmt = $pdo->prepare("
        SELECT r.*, u.name as user_name, u.avatar as user_avatar
        FROM reservations r
        JOIN users u ON r.user_id = u.id
        WHERE r.id != :cur_id
          AND r.status IN ('booked', 'pending', 'shared')
          AND r.date_end <= :cur_start
        ORDER BY r.date_end DESC
        LIMIT 1
    ");
    $prevStmt->execute([
        ':cur_id' => $res['id'],
        ':cur_start' => $res['date_start']
    ]);
    $prevRes = $prevStmt->fetch();

    // Fetch handover notes left for this reservation or left by the previous guest
    $notes = [];
    if ($prevRes) {
        $notesStmt = $pdo->prepare("
            SELECT hn.*, u.name as author_name, u.avatar as author_avatar
            FROM handover_notes hn
            JOIN users u ON hn.author_user_id = u.id
            WHERE hn.target_reservation_id = :cur_id
               OR hn.reservation_id = :prev_id
            ORDER BY hn.created_at DESC
        ");
        $notesStmt->execute([
            ':cur_id' => $res['id'],
            ':prev_id' => $prevRes['id']
        ]);
        $notes = $notesStmt->fetchAll();
    } else {
        $notesStmt = $pdo->prepare("
            SELECT hn.*, u.name as author_name, u.avatar as author_avatar
            FROM handover_notes hn
            JOIN users u ON hn.author_user_id = u.id
            WHERE hn.target_reservation_id = :cur_id
            ORDER BY hn.created_at DESC
        ");
        $notesStmt->execute([':cur_id' => $res['id']]);
        $notes = $notesStmt->fetchAll();
    }

    jsonResponse([
        'success' => true,
        'has_arrival' => true,
        'is_ongoing' => $isOngoing,
        'hours_until_checkin' => $hoursUntil,
        'minutes_until_checkin' => $minutesUntil,
        'reservation' => $res,
        'notes_from_prev' => $notes,
        'previous_guest' => $prevRes ? [
            'name' => $prevRes['user_name'],
            'avatar' => $prevRes['user_avatar'],
            'date_end' => $prevRes['date_end']
        ] : null
    ]);
}
