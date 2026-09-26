<?php
/**
 * ChaletWeShare — Background Cron Job
 * Auto-approves pending reservations once 12h veto deadline has passed.
 * Invoked by cyon.ch cron or web hook.
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/push.php';

// Access control: allow CLI or valid cron_key
$config = getConfig();
$cronKey = $config['cron_key'] ?? '';
$isCli = (php_sapi_name() === 'cli');
$providedKey = $_GET['key'] ?? ($_SERVER['HTTP_X_CRON_KEY'] ?? '');

if (!$isCli) {
    if (empty($cronKey) || !hash_equals($cronKey, (string)$providedKey)) {
        jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 403);
    }
}

date_default_timezone_set('Europe/Zurich');

$pdo = getDbConnection();
$now = new DateTime('now', new DateTimeZone('Europe/Zurich'));
$nowStr = $now->format('Y-m-d H:i:s');
$currentHour = (int) $now->format('G'); // 0 to 23 in Europe/Zurich

$todayDt = new DateTime('today', new DateTimeZone('Europe/Zurich'));
$todayStr = $todayDt->format('Y-m-d');
$tomorrowStr = (clone $todayDt)->modify('+1 day')->format('Y-m-d');

// 1. Cancel stale pending reservations whose end date has already passed
$staleStmt = $pdo->prepare("
    UPDATE reservations 
    SET status = 'cancelled', resolved_at = ? 
    WHERE status = 'pending' 
      AND date_end < ?
");
$staleStmt->execute([$nowStr, $todayStr]);
$staleCancelledCount = $staleStmt->rowCount();

// 1b. Purge notifications older than 14 days
try {
    $fourteenDaysAgo = (clone $now)->modify('-14 days')->format('Y-m-d H:i:s');
    $purgeStmt = $pdo->prepare("DELETE FROM notifications WHERE created_at < ?");
    $purgeStmt->execute([$fourteenDaysAgo]);
} catch (\Throwable $e) {
    error_log("Notification cleanup error: " . $e->getMessage());
}

// 2. Find all pending reservations past their veto deadline (not disputed, ending today or later)
$stmt = $pdo->prepare("
    SELECT r.id, r.user_id, r.date_start, r.date_end, r.veto_deadline,
           u.name as user_name, u.avatar as user_avatar
    FROM reservations r
    JOIN users u ON r.user_id = u.id
    WHERE r.status = 'pending'
      AND r.veto_deadline IS NOT NULL
      AND r.veto_deadline <= ?
      AND r.date_end >= ?
      AND NOT EXISTS (SELECT 1 FROM vetoes v WHERE v.reservation_id = r.id)
");
$stmt->execute([$nowStr, $todayStr]);
$expired = $stmt->fetchAll();

$approvedList = [];

foreach ($expired as $res) {
    try {
        // Mark as booked with resolved_at timestamp
        $upd = $pdo->prepare("UPDATE reservations SET status = 'booked', resolved_at = ? WHERE id = ?");
        $upd->execute([$nowStr, $res['id']]);

        // Insert notification ONLY for the reservation owner
        $autoPayload = json_encode([
            'reservation_id' => (int) $res['id'],
            'date' => $res['date_start'],
            'type' => 'auto_approved'
        ]);
        $notifIns = $pdo->prepare("
            INSERT INTO notifications (user_id, type, message, related_reservation_id, action_payload, created_at)
            VALUES (?, 'auto_approved', ?, ?, ?, ?)
        ");
        $msg = "🎉 Reservation bestätigt: Deine Reservation ({$res['date_start']} bis {$res['date_end']}) ist nun fest gebucht (Veto-Frist abgelaufen).";
        $notifIns->execute([$res['user_id'], $msg, $res['id'], $autoPayload, $nowStr]);

        // Dispatch Web Push notification ONLY to reservation owner with deep link date
        sendWebPushToUser($pdo, $res['user_id'], 'ChaletWeShare: Reservation bestätigt', $msg, [
            'reservation_id' => (int) $res['id'],
            'date' => $res['date_start'],
            'type' => 'auto_approved'
        ]);

        // Calculate days and weekend days for summary output
        $start = new DateTime($res['date_start']);
        $end = new DateTime($res['date_end']);
        $interval = new DateInterval('P1D');
        $period = new DatePeriod($start, $interval, (clone $end)->modify('+1 day'));

        $totalDays = 0;
        $weekendDays = 0;
        foreach ($period as $dt) {
            $totalDays++;
            $w = (int) $dt->format('N'); // 1 = Mon, 7 = Sun
            if ($w === 6 || $w === 7) {
                $weekendDays++;
            }
        }

        $approvedList[] = [
            'id' => $res['id'],
            'user_name' => $res['user_name'],
            'dates' => "{$res['date_start']} bis {$res['date_end']}",
            'weekend_days' => $weekendDays,
            'total_days' => $totalDays
        ];
    } catch (\Throwable $e) {
        error_log("Auto-approve error for reservation {$res['id']}: " . $e->getMessage());
    }
}

// 3. Check for stays starting today (arrival briefing reminder)
// Only send between 08:00 and 22:00 to avoid waking guests up at 00:00 midnight on hourly crons
$arrivalReminders = 0;
if ($currentHour >= 8) {
    $startingStmt = $pdo->prepare("
        SELECT r.id, r.user_id, r.date_start, r.date_end, u.name as user_name
        FROM reservations r
        JOIN users u ON r.user_id = u.id
        WHERE r.status = 'booked'
          AND r.date_start = ?
    ");
    $startingStmt->execute([$todayStr]);
    $startingStays = $startingStmt->fetchAll();

    foreach ($startingStays as $stay) {
        try {
            // Determine all occupants (primary requester + co-occupant if shared)
            $recipients = [(int)$stay['user_id']];
            $sharedStmt = $pdo->prepare("
                SELECT winner_user_id 
                FROM conflict_resolutions 
                WHERE reservation_id = ? AND resolution_type = 'shared' AND winner_user_id IS NOT NULL
            ");
            $sharedStmt->execute([$stay['id']]);
            $coOccupant = $sharedStmt->fetchColumn();
            if ($coOccupant && !in_array((int)$coOccupant, $recipients, true)) {
                $recipients[] = (int)$coOccupant;
            }

            foreach ($recipients as $recipientId) {
                $checkNotif = $pdo->prepare("
                    SELECT COUNT(*) FROM notifications 
                    WHERE user_id = ? AND type = 'arrival_reminder' AND related_reservation_id = ?
                ");
                $checkNotif->execute([$recipientId, $stay['id']]);
                if ((int)$checkNotif->fetchColumn() === 0) {
                    $arrivalMsg = "Dein Aufenthalt im Chalet Alpenrose beginnt heute! Bitte beachte das Anreise-Briefing und eventuelle Übergabe-Notizen.";
                    $arrPayload = json_encode([
                        'reservation_id' => (int) $stay['id'],
                        'date' => $stay['date_start'],
                        'action' => 'arrival_briefing',
                        'type' => 'arrival_reminder'
                    ]);
                    $insRemind = $pdo->prepare("
                        INSERT INTO notifications (user_id, type, message, related_reservation_id, action_payload, created_at)
                        VALUES (?, 'arrival_reminder', ?, ?, ?, ?)
                    ");
                    $insRemind->execute([$recipientId, $arrivalMsg, $stay['id'], $arrPayload, $nowStr]);

                    sendWebPushToUser(
                        $pdo,
                        $recipientId,
                        'Chalet Alpenrose — Willkommen & Anreise',
                        $arrivalMsg,
                        [
                            'reservation_id' => (int) $stay['id'],
                            'date' => $stay['date_start'],
                            'action' => 'arrival_briefing',
                            'type' => 'arrival_reminder'
                        ]
                    );
                    $arrivalReminders++;
                }
            }
        } catch (\Throwable $e) {
            error_log("Arrival reminder error for reservation {$stay['id']}: " . $e->getMessage());
        }
    }
}

// 4. Check for active stays ending soon (checkout reminder for handover note)
// - Stays ending tomorrow: only remind from 17:00 onwards (the evening before checkout)
// - Stays ending today: fallback reminder from 08:00 onwards
$handoverReminders = 0;
$targetEndDates = [];
if ($currentHour >= 17) {
    $targetEndDates[] = $tomorrowStr;
}
if ($currentHour >= 8) {
    $targetEndDates[] = $todayStr;
}

if (!empty($targetEndDates)) {
    $inClause = implode(',', array_fill(0, count($targetEndDates), '?'));
    $endingParams = array_merge([$todayStr], $targetEndDates);

    $endingStmt = $pdo->prepare("
        SELECT r.id, r.user_id, r.date_start, r.date_end, u.name as user_name
        FROM reservations r
        JOIN users u ON r.user_id = u.id
        WHERE r.status = 'booked'
          AND r.date_start <= ?
          AND r.date_end IN ($inClause)
    ");
    $endingStmt->execute($endingParams);
    $endingStays = $endingStmt->fetchAll();

    foreach ($endingStays as $stay) {
        try {
            // Check if ANY handover note was already submitted for this reservation
            $checkNote = $pdo->prepare("SELECT COUNT(*) FROM handover_notes WHERE reservation_id = ?");
            $checkNote->execute([$stay['id']]);
            if ((int)$checkNote->fetchColumn() === 0) {
                // Determine all occupants (primary requester + co-occupant if shared)
                $recipients = [(int)$stay['user_id']];
                $sharedStmt = $pdo->prepare("
                    SELECT winner_user_id 
                    FROM conflict_resolutions 
                    WHERE reservation_id = ? AND resolution_type = 'shared' AND winner_user_id IS NOT NULL
                ");
                $sharedStmt->execute([$stay['id']]);
                $coOccupant = $sharedStmt->fetchColumn();
                if ($coOccupant && !in_array((int)$coOccupant, $recipients, true)) {
                    $recipients[] = (int)$coOccupant;
                }

                foreach ($recipients as $recipientId) {
                    $checkNotif = $pdo->prepare("
                        SELECT COUNT(*) FROM notifications 
                        WHERE user_id = ? AND type = 'handover_reminder' AND related_reservation_id = ?
                    ");
                    $checkNotif->execute([$recipientId, $stay['id']]);
                    if ((int)$checkNotif->fetchColumn() === 0) {
                        $remindMsg = "Dein Aufenthalt im Chalet Alpenrose endet bald. Gibt es etwas, das der nächste Gast wissen sollte?";
                        $handPayload = json_encode([
                            'reservation_id' => (int) $stay['id'],
                            'date' => $stay['date_end'],
                            'action' => 'handover_prompt',
                            'type' => 'handover_reminder'
                        ]);
                        $insRemind = $pdo->prepare("
                            INSERT INTO notifications (user_id, type, message, related_reservation_id, action_payload, created_at)
                            VALUES (?, 'handover_reminder', ?, ?, ?, ?)
                        ");
                        $insRemind->execute([$recipientId, $remindMsg, $stay['id'], $handPayload, $nowStr]);

                        sendWebPushToUser(
                            $pdo,
                            $recipientId,
                            'Chalet Alpenrose — Abreise-Erinnerung',
                            $remindMsg,
                            [
                                'reservation_id' => (int) $stay['id'],
                                'date' => $stay['date_end'],
                                'action' => 'handover_prompt',
                                'type' => 'handover_reminder'
                            ]
                        );
                        $handoverReminders++;
                    }
                }
            }
        } catch (\Throwable $e) {
            error_log("Departure reminder error for reservation {$stay['id']}: " . $e->getMessage());
        }
    }
}

// 5. Working Day Reminders
// 5a. RSVP Reminder: 7 days before Arbeitstag (send at or after 09:00)
$workingDayRsvpReminders = 0;
if ($currentHour >= 9) {
    $sevenDaysAheadStr = (clone $todayDt)->modify('+7 days')->format('Y-m-d');
    $wdStmt = $pdo->prepare("
        SELECT w.id, w.user_id, w.date, w.season, u.name as organizer_name
        FROM working_days w
        JOIN users u ON w.user_id = u.id
        WHERE w.date = ?
    ");
    $wdStmt->execute([$sevenDaysAheadStr]);
    $upcomingWds7 = $wdStmt->fetchAll();

    foreach ($upcomingWds7 as $uwd) {
        $pendingUsersStmt = $pdo->prepare("
            SELECT u.id, u.name 
            FROM users u
            WHERE u.id NOT IN (
                SELECT r.user_id FROM working_day_rsvps r WHERE r.working_day_id = ?
            )
        ");
        $pendingUsersStmt->execute([$uwd['id']]);
        $pendingUsers = $pendingUsersStmt->fetchAll();

        $dateParts = explode('-', $uwd['date']);
        $friendlyDate = "{$dateParts[2]}.{$dateParts[1]}.{$dateParts[0]}";
        $seasonLabel = $uwd['season'] === 'autumn' ? 'Einwintern' : 'Frühjahrsputz';

        foreach ($pendingUsers as $pu) {
            $checkNotif = $pdo->prepare("
                SELECT COUNT(*) FROM notifications 
                WHERE user_id = ? AND type = 'working_day_rsvp_reminder' AND message LIKE ?
            ");
            $checkNotif->execute([$pu['id'], "%{$uwd['date']}%"]);
            if ((int)$checkNotif->fetchColumn() === 0) {
                $remindMsg = "Erinnerung: In 7 Tagen ist Arbeitstag ({$seasonLabel} am {$friendlyDate}). Bist du dabei? Bitte gib kurz Bescheid!";
                $rsvpPayload = json_encode([
                    'working_day_id' => (int) $uwd['id'],
                    'date' => $uwd['date'],
                    'season' => $uwd['season'],
                    'type' => 'working_day_rsvp_reminder'
                ]);
                $ins = $pdo->prepare("
                    INSERT INTO notifications (user_id, type, message, action_payload, created_at)
                    VALUES (?, 'working_day_rsvp_reminder', ?, ?, ?)
                ");
                $ins->execute([$pu['id'], $remindMsg, $rsvpPayload, $nowStr]);

                sendWebPushToUser(
                    $pdo,
                    $pu['id'],
                    "ChaletWeShare: Arbeitstag Erinnerung",
                    $remindMsg,
                    [
                        'type' => 'working_day_rsvp_reminder',
                        'working_day_id' => (int) $uwd['id'],
                        'date' => $uwd['date']
                    ]
                );
                $workingDayRsvpReminders++;
            }
        }
    }
}

// 5b. Event Eve Reminder: 1 day before Arbeitstag (tomorrow, send at or after 10:00)
$workingDayEveReminders = 0;
if ($currentHour >= 10) {
    $wdTomorrowStmt = $pdo->prepare("
        SELECT w.id, w.user_id, w.date, w.season
        FROM working_days w
        WHERE w.date = ?
    ");
    $wdTomorrowStmt->execute([$tomorrowStr]);
    $upcomingWds1 = $wdTomorrowStmt->fetchAll();

    foreach ($upcomingWds1 as $uwd) {
        $attendeeStmt = $pdo->prepare("
            SELECT user_id 
            FROM working_day_rsvps 
            WHERE working_day_id = ? AND status = 'yes'
        ");
        $attendeeStmt->execute([$uwd['id']]);
        $attendees = $attendeeStmt->fetchAll();

        $seasonLabel = $uwd['season'] === 'autumn' ? 'Einwintern' : 'Frühjahrsputz';

        foreach ($attendees as $att) {
            $checkNotif = $pdo->prepare("
                SELECT COUNT(*) FROM notifications 
                WHERE user_id = ? AND type = 'working_day_eve_reminder' AND message LIKE ?
            ");
            $checkNotif->execute([$att['user_id'], "%{$uwd['date']}%"]);
            if ((int)$checkNotif->fetchColumn() === 0) {
                $eveMsg = "Morgen ist gemeinsamer Arbeitstag ({$seasonLabel}) im Chalet Alpenrose! Wir freuen uns auf die gemeinsame Zeit.";
                $evePayload = json_encode([
                    'working_day_id' => (int) $uwd['id'],
                    'date' => $uwd['date'],
                    'season' => $uwd['season'],
                    'type' => 'working_day_eve_reminder'
                ]);
                $ins = $pdo->prepare("
                    INSERT INTO notifications (user_id, type, message, action_payload, created_at)
                    VALUES (?, 'working_day_eve_reminder', ?, ?, ?)
                ");
                $ins->execute([$att['user_id'], $eveMsg, $evePayload, $nowStr]);

                sendWebPushToUser(
                    $pdo,
                    $att['user_id'],
                    "ChaletWeShare: Morgen Arbeitstag!",
                    $eveMsg,
                    [
                        'type' => 'working_day_eve_reminder',
                        'working_day_id' => (int) $uwd['id'],
                        'date' => $uwd['date']
                    ]
                );
                $workingDayEveReminders++;
            }
        }
    }
}

// 5c. Proposal Voting Reminder: 48h after creation if pending siblings (send between 10:00 and 18:00)
$workingDayVoteReminders = 0;
if ($currentHour >= 10 && $currentHour <= 18) {
    $twoDaysAgoStr = (clone $now)->modify('-48 hours')->format('Y-m-d H:i:s');
    $propStmt = $pdo->prepare("
        SELECT w.id, w.user_id, w.season, w.proposed_dates, u.name as organizer_name
        FROM working_days w
        JOIN users u ON w.user_id = u.id
        WHERE w.status = 'proposed'
          AND w.created_at <= ?
    ");
    $propStmt->execute([$twoDaysAgoStr]);
    $activeProposals = $propStmt->fetchAll();

    foreach ($activeProposals as $prop) {
        $pendingVotersStmt = $pdo->prepare("
            SELECT u.id, u.name 
            FROM users u
            WHERE u.id NOT IN (
                SELECT r.user_id 
                FROM working_day_rsvps r 
                WHERE r.working_day_id = ? AND r.votes IS NOT NULL
            )
        ");
        $pendingVotersStmt->execute([$prop['id']]);
        $pendingVoters = $pendingVotersStmt->fetchAll();

        $seasonLabel = $prop['season'] === 'autumn' ? 'Einwintern' : 'Frühjahrsputz';

        $pDates = [];
        if (!empty($prop['proposed_dates'])) {
            $pDates = is_string($prop['proposed_dates']) ? json_decode($prop['proposed_dates'], true) : $prop['proposed_dates'];
        }
        $firstPropDate = (is_array($pDates) && !empty($pDates[0])) ? $pDates[0] : null;

        foreach ($pendingVoters as $pv) {
            $checkNotif = $pdo->prepare("
                SELECT COUNT(*) FROM notifications 
                WHERE user_id = ? AND type = 'working_day_vote_reminder' 
                  AND action_payload LIKE ?
            ");
            $checkNotif->execute([$pv['id'], "%\"working_day_id\":{$prop['id']}%"]);
            if ((int)$checkNotif->fetchColumn() === 0) {
                $remindMsg = "Erinnerung: Deine Stimme für den {$seasonLabel} fehlt noch. Welcher der Termine passt dir am besten?";
                $ins = $pdo->prepare("
                    INSERT INTO notifications (user_id, type, message, action_payload, created_at)
                    VALUES (?, 'working_day_vote_reminder', ?, ?, ?)
                ");
                $actionPayload = json_encode([
                    'working_day_id' => (int) $prop['id'],
                    'season' => $prop['season'],
                    'proposed_dates' => $pDates,
                    'date' => $firstPropDate,
                    'type' => 'working_day_vote_reminder'
                ]);
                $ins->execute([$pv['id'], $remindMsg, $actionPayload, $nowStr]);

                sendWebPushToUser(
                    $pdo,
                    $pv['id'],
                    "ChaletWeShare: Terminfindung {$seasonLabel}",
                    $remindMsg,
                    [
                        'type' => 'working_day_proposal',
                        'working_day_id' => (int) $prop['id'],
                        'date' => $firstPropDate
                    ]
                );
                $workingDayVoteReminders++;
            }
        }
    }
}

jsonResponse([
    'success' => true,
    'timestamp' => $nowStr,
    'current_hour' => $currentHour,
    'stale_cancelled_count' => $staleCancelledCount,
    'approved_count' => count($approvedList),
    'approved' => $approvedList,
    'arrival_reminders' => $arrivalReminders,
    'handover_reminders' => $handoverReminders,
    'working_day_rsvp_reminders' => $workingDayRsvpReminders,
    'working_day_eve_reminders' => $workingDayEveReminders,
    'working_day_vote_reminders' => $workingDayVoteReminders
]);


