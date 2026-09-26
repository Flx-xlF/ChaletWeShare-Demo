<?php
/**
 * ChaletWeShare — Reservations & Maintenance API
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/push.php';


date_default_timezone_set('Europe/Zurich');

$input = getJsonInput();
$action = $input['action'] ?? ($_GET['action'] ?? '');

$pdo = getDbConnection();

/**
 * Compute the 20:15 veto deadline (Europe/Zurich)
 * - 00:00–07:59 → Same day or +($daysOffset-1) day 20:15
 * - 08:00–23:59 → +$daysOffset days 20:15
 */
function computeVetoDeadline(?DateTime $now = null, int $daysOffset = 1): DateTime {
    $tz = new DateTimeZone('Europe/Zurich');
    $time = $now ? clone $now : new DateTime('now', $tz);
    $time->setTimezone($tz);

    $hour = (int) $time->format('G');

    $deadline = clone $time;
    if ($hour < 8) {
        $offset = max(0, $daysOffset - 1);
        if ($offset > 0) {
            $deadline->modify("+{$offset} days");
        }
        $deadline->setTime(20, 15, 0);
    } else {
        $deadline->modify("+{$daysOffset} days");
        $deadline->setTime(20, 15, 0);
    }
    return $deadline;
}

/**
 * Get end of allowed booking window: October 31 of following year
 */
function getBookingWindowEnd(): DateTime {
    $tz = new DateTimeZone('Europe/Zurich');
    $now = new DateTime('now', $tz);
    $nextYear = (int) $now->format('Y') + 1;
    return new DateTime("{$nextYear}-10-31 23:59:59", $tz);
}


try {
switch ($action) {
    case 'list':
        requireGateOrUser($pdo, $input);

        // Opportunistically transition pending reservations past veto deadline to booked
        try {
            $pdo->query("
                UPDATE reservations 
                SET status = 'booked' 
                WHERE status = 'pending' 
                  AND veto_deadline IS NOT NULL 
                  AND veto_deadline <= NOW()
            ");
        } catch (\Throwable $e) {
            // Non-critical, continue
        }

        // Retrieve all active reservations & maintenance blocks
        $resStmt = $pdo->query("
            SELECT r.id, r.user_id, r.date_start, r.date_end, r.status, r.created_at, r.veto_deadline,
                   u.profile_id, u.name as user_name, u.avatar as user_avatar
            FROM reservations r
            JOIN users u ON r.user_id = u.id
            WHERE r.status IN ('pending', 'booked', 'vetoed', 'shared')
            ORDER BY r.date_start ASC
        ");
        $reservations = $resStmt->fetchAll();

        // Fetch approvals for pending reservations
        $approvalsStmt = $pdo->query("
            SELECT a.reservation_id, a.user_id, u.name as user_name, u.avatar as user_avatar
            FROM reservation_approvals a
            JOIN users u ON a.user_id = u.id
        ");
        $approvalsMap = [];
        foreach ($approvalsStmt->fetchAll() as $row) {
            $approvalsMap[$row['reservation_id']][] = [
                'user_id' => (int)$row['user_id'],
                'user_name' => $row['user_name'],
                'user_avatar' => $row['user_avatar']
            ];
        }

        // Fetch vetoes for vetoed / conflict reservations
        $vetoesStmt = $pdo->query("
            SELECT v.reservation_id, v.user_id, u.name as user_name, u.avatar as user_avatar
            FROM vetoes v
            JOIN users u ON v.user_id = u.id
            ORDER BY v.created_at ASC
        ");
        $vetoesMap = [];
        foreach ($vetoesStmt->fetchAll() as $row) {
            $vetoesMap[$row['reservation_id']][] = [
                'user_id' => (int)$row['user_id'],
                'user_name' => $row['user_name'],
                'user_avatar' => $row['user_avatar']
            ];
        }

        // Fetch active conflict proposals
        $proposalsMap = [];
        try {
            $proposalsStmt = $pdo->query("
                SELECT cp.reservation_id, cp.proposer_user_id, cp.proposal_type, cp.created_at,
                       u.name as proposer_user_name, u.avatar as proposer_user_avatar
                FROM conflict_proposals cp
                JOIN users u ON cp.proposer_user_id = u.id
            ");
            if ($proposalsStmt) {
                foreach ($proposalsStmt->fetchAll() as $p) {
                    $proposalsMap[$p['reservation_id']] = [
                        'proposer_user_id' => (int)$p['proposer_user_id'],
                        'proposer_user_name' => $p['proposer_user_name'],
                        'proposer_user_avatar' => $p['proposer_user_avatar'],
                        'proposal_type' => $p['proposal_type'],
                        'created_at' => $p['created_at']
                    ];
                }
            }
        } catch (\Throwable $e) {
            // Silently fallback if table doesn't exist yet
        }

        // Fetch handover note counts
        $handoverMap = [];
        try {
            $hoStmt = $pdo->query("SELECT reservation_id, COUNT(*) as cnt FROM handover_notes GROUP BY reservation_id");
            if ($hoStmt) {
                foreach ($hoStmt->fetchAll() as $row) {
                    $handoverMap[$row['reservation_id']] = (int)$row['cnt'];
                }
            }
        } catch (\Throwable $e) {}

        // Fetch conflict resolutions
        $resolutionsMap = [];
        try {
            $crStmt = $pdo->query("
                SELECT cr.reservation_id, cr.resolution_type, cr.winner_user_id, cr.resolved_at,
                       u.name as winner_name, u.avatar as winner_avatar
                FROM conflict_resolutions cr
                LEFT JOIN users u ON cr.winner_user_id = u.id
            ");
            if ($crStmt) {
                foreach ($crStmt->fetchAll() as $row) {
                    $resolutionsMap[$row['reservation_id']] = [
                        'resolution_type' => $row['resolution_type'],
                        'winner_user_id' => $row['winner_user_id'] ? (int)$row['winner_user_id'] : null,
                        'winner_name' => $row['winner_name'],
                        'winner_avatar' => $row['winner_avatar'],
                        'resolved_at' => $row['resolved_at']
                    ];
                }
            }
        } catch (\Throwable $e) {}

        foreach ($reservations as &$res) {
            $res['approvals'] = $approvalsMap[$res['id']] ?? [];
            $res['vetoes'] = $vetoesMap[$res['id']] ?? [];
            $res['conflict_proposal'] = $proposalsMap[$res['id']] ?? null;
            $res['handover_count'] = $handoverMap[$res['id']] ?? 0;
            $res['resolution'] = $resolutionsMap[$res['id']] ?? null;
        }
        unset($res);

        $maintStmt = $pdo->query("
            SELECT m.id, m.user_id, m.date_start, m.date_end, m.half_day, m.reason, m.created_at,
                   u.profile_id, u.name as user_name, u.avatar as user_avatar
            FROM maintenance_blocks m
            JOIN users u ON m.user_id = u.id
            ORDER BY m.date_start ASC
        ");
        $maintenance = $maintStmt->fetchAll();

        // Fetch maintenance overlap approvals
        $maintApprMap = [];
        try {
            $maintApprStmt = $pdo->query("
                SELECT a.maintenance_id, a.allowed_user_id, a.granted_by_user_id, a.created_at,
                       u.name as allowed_user_name, u.avatar as allowed_user_avatar
                FROM maintenance_overlap_approvals a
                JOIN users u ON a.allowed_user_id = u.id
            ");
            foreach ($maintApprStmt->fetchAll() as $row) {
                $maintApprMap[$row['maintenance_id']][] = [
                    'allowed_user_id' => (int)$row['allowed_user_id'],
                    'granted_by_user_id' => (int)$row['granted_by_user_id'],
                    'allowed_user_name' => $row['allowed_user_name'],
                    'allowed_user_avatar' => $row['allowed_user_avatar'],
                    'created_at' => $row['created_at']
                ];
            }
        } catch (\Throwable $e) {}

        foreach ($maintenance as &$m) {
            $m['id'] = (int)$m['id'];
            $m['user_id'] = (int)$m['user_id'];
            $m['approvals'] = $maintApprMap[$m['id']] ?? [];
        }
        unset($m);

        // Fetch working days with RSVPs and proposed dates/votes
        $wdStmt = $pdo->query("
            SELECT w.id, w.user_id, w.date, w.season, w.status, w.proposed_dates, w.created_at,
                   u.name as user_name, u.avatar as user_avatar
            FROM working_days w
            JOIN users u ON w.user_id = u.id
            ORDER BY COALESCE(w.date, w.created_at) ASC
        ");
        $workingDays = $wdStmt->fetchAll();

        $rsvpStmt = $pdo->query("
            SELECT r.working_day_id, r.user_id, r.status, r.votes, r.updated_at,
                   u.name as user_name, u.avatar as user_avatar
            FROM working_day_rsvps r
            JOIN users u ON r.user_id = u.id
            ORDER BY r.updated_at ASC
        ");
        $rsvpMap = [];
        foreach ($rsvpStmt->fetchAll() as $row) {
            $votes = null;
            if (!empty($row['votes'])) {
                $decoded = is_string($row['votes']) ? json_decode($row['votes'], true) : $row['votes'];
                if (is_array($decoded)) $votes = $decoded;
            }
            $rsvpMap[$row['working_day_id']][] = [
                'user_id' => (int)$row['user_id'],
                'user_name' => $row['user_name'],
                'user_avatar' => $row['user_avatar'],
                'status' => $row['status'],
                'votes' => $votes,
                'updated_at' => $row['updated_at']
            ];
        }

        foreach ($workingDays as &$wd) {
            $wd['id'] = (int)$wd['id'];
            $wd['user_id'] = (int)$wd['user_id'];
            $wd['status'] = $wd['status'] ?? 'finalized';
            $proposed = [];
            if (!empty($wd['proposed_dates'])) {
                $dec = is_string($wd['proposed_dates']) ? json_decode($wd['proposed_dates'], true) : $wd['proposed_dates'];
                if (is_array($dec)) $proposed = $dec;
            }
            $wd['proposed_dates'] = $proposed;
            $wd['rsvps'] = $rsvpMap[$wd['id']] ?? [];
        }
        unset($wd);

        // Also fetch total sibling user count for approval tracking
        $userCount = (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();

        jsonResponse([
            'success' => true,
            'reservations' => $reservations,
            'maintenance' => $maintenance,
            'working_days' => $workingDays,
            'user_count' => $userCount,
            'booking_window_end' => getBookingWindowEnd()->format('Y-m-d')
        ]);
        break;

    case 'create':
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $dateStart = trim($input['date_start'] ?? '');
        $dateEnd = trim($input['date_end'] ?? '');

        if (!$dateStart || !$dateEnd) {
            jsonResponse(['success' => false, 'error' => 'Start- und Enddatum erforderlich.'], 400);
        }

        if ($dateEnd <= $dateStart) {
            jsonResponse(['success' => false, 'error' => 'Mindestaufenthalt ist 1 Nacht (Abreisetag muss nach dem Anreisetag liegen).'], 400);
        }

        $startDT = new DateTime($dateStart);
        $endDT = new DateTime($dateEnd);
        $diff = $startDT->diff($endDT);
        if ($diff->days > 31) {
            jsonResponse(['success' => false, 'error' => 'Die maximale Aufenthaltsdauer beträgt 31 Tage.'], 400);
        }

        $tz = new DateTimeZone('Europe/Zurich');
        $todayStr = (new DateTime('now', $tz))->format('Y-m-d');
        if ($dateStart < $todayStr) {
            jsonResponse(['success' => false, 'error' => 'Buchungen in der Vergangenheit sind nicht möglich.'], 400);
        }

        $windowEnd = getBookingWindowEnd()->format('Y-m-d');
        if ($dateEnd > $windowEnd) {
            jsonResponse([
                'success' => false,
                'error' => "Buchungen sind maximal bis zum 31. Oktober des Folgejahres ({$windowEnd}) möglich."
            ], 400);
        }

        // Execute collision checks and insertion inside a database transaction to prevent race conditions
        $pdo->beginTransaction();
        try {
            // 1. Collision check: overlapping pending or booked reservations
            // Strict inequality: back-to-back bookings sharing a boundary day are allowed
            $collStmt = $pdo->prepare("
                SELECT r.id, r.date_start, r.date_end, r.status, u.name as user_name
                FROM reservations r
                JOIN users u ON r.user_id = u.id
                WHERE r.status IN ('pending', 'booked', 'shared', 'vetoed')
                  AND r.date_start < ?
                  AND r.date_end > ?
            ");
            $collStmt->execute([$dateEnd, $dateStart]);
            $collision = $collStmt->fetch();

            if ($collision) {
                $pdo->rollBack();
                jsonResponse([
                    'success' => false,
                    'error' => "Konflikt: Zeitraum überschneidet sich mit bestehender Reservation von {$collision['user_name']} ({$collision['date_start']} bis {$collision['date_end']})."
                ], 409);
            }

            // 2. Collision check: maintenance blocks
            $maintStmt = $pdo->prepare("
                SELECT id, user_id, date_start, date_end, half_day, reason
                FROM maintenance_blocks
                WHERE date_start <= ? AND date_end >= ?
            ");
            $maintStmt->execute([$dateEnd, $dateStart]);
            $maints = $maintStmt->fetchAll();

            foreach ($maints as $m) {
                // True Doppelnutzung: If creator of maintenance or if overlap was approved, bypass collision!
                if ((int)$m['user_id'] === (int)$user['id']) {
                    continue;
                }
                try {
                    $apprCheck = $pdo->prepare("
                        SELECT id FROM maintenance_overlap_approvals
                        WHERE maintenance_id = ? AND allowed_user_id = ?
                    ");
                    $apprCheck->execute([(int)$m['id'], (int)$user['id']]);
                    if ($apprCheck->fetch()) {
                        continue; // Overlap explicitly permitted by the maintenance organizer!
                    }
                } catch (\Throwable $e) {}

                if ($m['half_day'] === 'full') {
                    $pdo->rollBack();
                    jsonResponse([
                        'success' => false,
                        'error' => "Tag ist durch Unterhalt komplett gesperrt: {$m['reason']} ({$m['date_start']})."
                    ], 409);
                }
                // Morning maintenance is allowed on dateStart (afternoon arrival)
                if ($m['date_start'] === $dateStart && $m['half_day'] === 'afternoon') {
                    $pdo->rollBack();
                    jsonResponse([
                        'success' => false,
                        'error' => "Am Anreisetag ist der Nachmittag durch Unterhalt belegt: {$m['reason']}."
                    ], 409);
                }
                // Afternoon maintenance is allowed on dateEnd (morning departure)
                if ($m['date_end'] === $dateEnd && $m['half_day'] === 'morning') {
                    $pdo->rollBack();
                    jsonResponse([
                        'success' => false,
                        'error' => "Am Abreisetag ist der Vormittag durch Unterhalt belegt: {$m['reason']}."
                    ], 409);
                }
                // Mid-stay maintenance of any type is a conflict
                if ($m['date_start'] > $dateStart && $m['date_end'] < $dateEnd) {
                    $pdo->rollBack();
                    jsonResponse([
                        'success' => false,
                        'error' => "Im Zeitraum liegt ein Unterhaltstag: {$m['reason']} ({$m['date_start']})."
                    ], 409);
                }
            }

            // 3. Collision check: working days (Spring / Autumn Arbeitstag)
            $wdCheck = $pdo->prepare("
                SELECT id, date, season FROM working_days
                WHERE date IS NOT NULL AND date >= ? AND date <= ?
            ");
            $wdCheck->execute([$dateStart, $dateEnd]);
            $wdCollision = $wdCheck->fetch();
            if ($wdCollision) {
                $seasonLabel = $wdCollision['season'] === 'spring' ? 'Frühjahrsputz' : 'Einwintern';
                $pdo->rollBack();
                jsonResponse([
                    'success' => false,
                    'error' => "Am {$wdCollision['date']} findet ein gemeinsamer Arbeitstag ({$seasonLabel}) statt. Keine normale Buchung möglich."
                ], 409);
            }

            // Calculate Veto Deadline & Status
            $now = new DateTime('now', $tz);
            $checkinTime = new DateTime($dateStart . ' 14:00:00', $tz);
            $diffHours = ($checkinTime->getTimestamp() - $now->getTimestamp()) / 3600.0;

            $status = 'pending';
            $vetoDeadlineStr = null;

            if ($diffHours < 24) {
                // < 24 hours before check-in: Instant confirmation!
                $status = 'booked';
                $vetoDeadlineStr = null;
            } elseif ($diffHours < 48) {
                // < 48 hours before check-in: Shortened 4-hour veto deadline from now
                $vetoDeadline = (clone $now)->modify('+4 hours');
                $vetoDeadlineStr = $vetoDeadline->format('Y-m-d H:i:s');
            } elseif ($diffHours >= 720) {
                // >= 30 days (720h) before check-in: Extended 3-day veto deadline at 20:15
                $vetoDeadline = computeVetoDeadline($now, 3);
                $vetoDeadlineStr = $vetoDeadline->format('Y-m-d H:i:s');
            } else {
                // Standard veto deadline (Zurich 20:15 rule, 1 day)
                $vetoDeadline = computeVetoDeadline($now, 1);
                $vetoDeadlineStr = $vetoDeadline->format('Y-m-d H:i:s');
            }

            // Insert reservation
            $insStmt = $pdo->prepare("
                INSERT INTO reservations (user_id, date_start, date_end, status, veto_deadline, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $insStmt->execute([
                $user['id'],
                $dateStart,
                $dateEnd,
                $status,
                $vetoDeadlineStr,
                $now->format('Y-m-d H:i:s')
            ]);
            $resId = $pdo->lastInsertId();

            // Create in-app notifications for all OTHER users
            $otherUsersStmt = $pdo->prepare("SELECT id FROM users WHERE id != ?");
            $otherUsersStmt->execute([$user['id']]);
            $otherUsers = $otherUsersStmt->fetchAll();

            if ($status === 'booked') {
                $notifMsg = "⚡ Spontanbuchung von {$user['name']}: {$dateStart} bis {$dateEnd} (Direkt bestätigt da < 24h vor Anreise).";
                $notifType = 'instant_reservation';
                $pushTitle = 'ChaletWeShare: Spontanbuchung bestätigt';
            } elseif ($diffHours < 48) {
                $notifMsg = "⚡ Kurzfristige Anfrage von {$user['name']}: {$dateStart} bis {$dateEnd}. 4h Veto-Frist bis " . (new DateTime($vetoDeadlineStr, $tz))->format('H:i') . " Uhr.";
                $notifType = 'new_reservation';
                $pushTitle = 'ChaletWeShare: Kurzfristige Reservation';
            } else {
                $notifMsg = "Neue Reservation von {$user['name']}: {$dateStart} bis {$dateEnd}. Veto möglich bis {$vetoDeadline->format('d.m. H:i')} Uhr.";
                $notifType = 'new_reservation';
                $pushTitle = 'ChaletWeShare: Neue Reservation';
            }

            $actionPayload = json_encode([
                'reservation_id' => (int) $resId,
                'date' => $dateStart,
                'date_start' => $dateStart,
                'date_end' => $dateEnd,
                'type' => $notifType
            ]);
            $notifIns = $pdo->prepare("
                INSERT INTO notifications (user_id, type, message, related_reservation_id, action_payload, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            foreach ($otherUsers as $ou) {
                $notifIns->execute([$ou['id'], $notifType, $notifMsg, $resId, $actionPayload, $now->format('Y-m-d H:i:s')]);
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            jsonResponse(['success' => false, 'error' => 'Fehler beim Speichern der Reservation: ' . $e->getMessage()], 500);
        }

        // Dispatch Web Push to all other siblings with full deep link info
        sendWebPushToAll($pdo, $user['id'], $pushTitle, $notifMsg, [
            'reservation_id' => (int) $resId,
            'date' => $dateStart,
            'type' => $notifType
        ]);

        jsonResponse([
            'success' => true,
            'message' => $status === 'booked' ? 'Reservation sofort bestätigt (< 24h).' : 'Reservation erfolgreich angefragt.',
            'reservation' => [
                'id' => (int) $resId,
                'user_id' => (int) $user['id'],
                'user_name' => $user['name'],
                'user_avatar' => $user['avatar'],
                'date_start' => $dateStart,
                'date_end' => $dateEnd,
                'status' => $status,
                'veto_deadline' => $vetoDeadlineStr,
                'approvals' => []
            ]
        ], 201);
        break;

    case 'cancel':
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $resId = (int) ($input['reservation_id'] ?? 0);
        if (!$resId) {
            jsonResponse(['success' => false, 'error' => 'Reservations-ID erforderlich.'], 400);
        }

        $chkStmt = $pdo->prepare("SELECT id, user_id, date_start, date_end, status FROM reservations WHERE id = ?");
        $chkStmt->execute([$resId]);
        $res = $chkStmt->fetch();

        if (!$res) {
            jsonResponse(['success' => false, 'error' => 'Reservation nicht gefunden.'], 404);
        }

        if ($res['user_id'] != $user['id']) {
            jsonResponse(['success' => false, 'error' => 'Nur der Ersteller kann die Reservation stornieren.'], 403);
        }

        $updStmt = $pdo->prepare("UPDATE reservations SET status = 'cancelled' WHERE id = ?");
        $updStmt->execute([$resId]);

        // Notify other family members that dates are free again
        $now = new DateTime('now', new DateTimeZone('Europe/Zurich'));
        $otherUsersStmt = $pdo->prepare("SELECT id FROM users WHERE id != ?");
        $otherUsersStmt->execute([$user['id']]);
        $notifMsg = "Daten wieder frei: {$user['name']} hat die Reservation ({$res['date_start']} bis {$res['date_end']}) storniert.";
        $actionPayload = json_encode([
            'reservation_id' => (int) $resId,
            'date' => $res['date_start'],
            'date_start' => $res['date_start'],
            'date_end' => $res['date_end'],
            'type' => 'cancellation'
        ]);
        $notifIns = $pdo->prepare("
            INSERT INTO notifications (user_id, type, message, related_reservation_id, action_payload, created_at)
            VALUES (?, 'cancellation', ?, ?, ?, ?)
        ");
        foreach ($otherUsersStmt->fetchAll() as $ou) {
            $notifIns->execute([$ou['id'], $notifMsg, $resId, $actionPayload, $now->format('Y-m-d H:i:s')]);
        }

        // Dispatch Web Push to all other siblings with freed date deep link
        sendWebPushToAll($pdo, $user['id'], 'ChaletWeShare: Daten wieder frei', $notifMsg, [
            'reservation_id' => (int) $resId,
            'date' => $res['date_start'],
            'type' => 'cancellation'
        ]);

        jsonResponse(['success' => true, 'message' => 'Reservation erfolgreich storniert.']);
        break;

    case 'create_maintenance':
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $dateStart = trim($input['date_start'] ?? '');
        $dateEnd = trim($input['date_end'] ?? '');
        $halfDay = trim($input['half_day'] ?? 'full'); // 'full' | 'morning' | 'afternoon'
        $reason = trim($input['reason'] ?? 'Unterhalt');

        if (!$dateStart || !$dateEnd) {
            jsonResponse(['success' => false, 'error' => 'Start- und Enddatum erforderlich.'], 400);
        }

        // Full day maintenance check: cannot collide with booked reservations
        if ($halfDay === 'full') {
            $collStmt = $pdo->prepare("
                SELECT r.id, r.date_start, r.date_end, u.name as user_name
                FROM reservations r
                JOIN users u ON r.user_id = u.id
                WHERE r.status = 'booked'
                  AND r.date_start <= ?
                  AND r.date_end >= ?
            ");
            $collStmt->execute([$dateEnd, $dateStart]);
            $bookedColl = $collStmt->fetch();
            if ($bookedColl) {
                jsonResponse([
                    'success' => false,
                    'error' => "An diesem Datum liegt bereits eine feste Buchung von {$bookedColl['user_name']} vor. Unterhalt kann nicht ganztags gesperrt werden."
                ], 409);
            }
        }

        $insMaint = $pdo->prepare("
            INSERT INTO maintenance_blocks (user_id, date_start, date_end, half_day, reason, created_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ");
        $insMaint->execute([$user['id'], $dateStart, $dateEnd, $halfDay, $reason]);

        $maintId = $pdo->lastInsertId();

        // Notify other family members and dispatch Web Push
        $now = new DateTime('now', new DateTimeZone('Europe/Zurich'));
        $otherUsersStmt = $pdo->prepare("SELECT id FROM users WHERE id != ?");
        $otherUsersStmt->execute([$user['id']]);
        $otherUsers = $otherUsersStmt->fetchAll();

        $halfDayLabel = $halfDay === 'morning' ? ' (Vormittag)' : ($halfDay === 'afternoon' ? ' (Nachmittag)' : '');
        $notifMsg = "Unterhalt von {$user['name']}: {$dateStart} bis {$dateEnd}{$halfDayLabel}. Grund: {$reason}.";
        $notifIns = $pdo->prepare("
            INSERT INTO notifications (user_id, type, message, action_payload, created_at)
            VALUES (?, 'maintenance_created', ?, ?, ?)
        ");
        $actionPayload = json_encode(['maintenance_id' => (int) $maintId, 'date' => $dateStart, 'type' => 'maintenance_created']);
        foreach ($otherUsers as $ou) {
            $notifIns->execute([$ou['id'], $notifMsg, $actionPayload, $now->format('Y-m-d H:i:s')]);
        }

        sendWebPushToAll($pdo, $user['id'], 'ChaletWeShare: Unterhalt eingetragen', $notifMsg, [
            'maintenance_id' => (int) $maintId,
            'date' => $dateStart,
            'type' => 'maintenance_created'
        ]);

        jsonResponse([
            'success' => true,
            'message' => 'Unterhalt erfolgreich eingetragen.',
            'maintenance' => [
                'id' => (int) $maintId,
                'user_id' => (int) $user['id'],
                'user_name' => $user['name'],
                'date_start' => $dateStart,
                'date_end' => $dateEnd,
                'half_day' => $halfDay,
                'reason' => $reason
            ]
        ], 201);
        break;

    case 'update_maintenance':
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $maintId = (int) ($input['maintenance_id'] ?? 0);
        if (!$maintId) {
            jsonResponse(['success' => false, 'error' => 'Blockierungs-ID erforderlich.'], 400);
        }

        $chkStmt = $pdo->prepare("SELECT id, user_id, date_start, date_end, half_day, reason FROM maintenance_blocks WHERE id = ?");
        $chkStmt->execute([$maintId]);
        $maint = $chkStmt->fetch();

        if (!$maint) {
            jsonResponse(['success' => false, 'error' => 'Unterhaltseintrag nicht gefunden.'], 404);
        }

        if ($maint['user_id'] != $user['id']) {
            jsonResponse(['success' => false, 'error' => 'Nur der Ersteller kann diesen Unterhaltseintrag bearbeiten.'], 403);
        }

        $halfDay = trim($input['half_day'] ?? $maint['half_day']); // 'full' | 'morning' | 'afternoon'
        $reason = trim($input['reason'] ?? $maint['reason']);
        if (!$reason) $reason = 'Unterhalt';

        // Collision check if expanding to full day
        if ($halfDay === 'full') {
            $collStmt = $pdo->prepare("
                SELECT r.id, r.date_start, r.date_end, u.name as user_name
                FROM reservations r
                JOIN users u ON r.user_id = u.id
                WHERE r.status = 'booked'
                  AND r.date_start <= ?
                  AND r.date_end >= ?
            ");
            $collStmt->execute([$maint['date_end'], $maint['date_start']]);
            $bookedColl = $collStmt->fetch();
            if ($bookedColl) {
                jsonResponse([
                    'success' => false,
                    'error' => "An diesem Datum liegt bereits eine feste Buchung von {$bookedColl['user_name']} vor. Unterhalt kann nicht ganztags gesperrt werden."
                ], 409);
            }
        }

        $updStmt = $pdo->prepare("
            UPDATE maintenance_blocks
            SET half_day = ?, reason = ?
            WHERE id = ?
        ");
        $updStmt->execute([$halfDay, $reason, $maintId]);

        // In-app notifications
        $now = new DateTime('now', new DateTimeZone('Europe/Zurich'));
        $otherUsersStmt = $pdo->prepare("SELECT id FROM users WHERE id != ?");
        $otherUsersStmt->execute([$user['id']]);
        $otherUsers = $otherUsersStmt->fetchAll();

        $halfDayLabel = $halfDay === 'morning' ? ' (Vormittag)' : ($halfDay === 'afternoon' ? ' (Nachmittag)' : ' (Ganzer Tag)');
        $notifMsg = "Unterhalt angepasst: {$user['name']} hat Unterhalt ({$maint['date_start']} bis {$maint['date_end']}) aktualisiert: {$halfDayLabel}, Grund: {$reason}.";
        $notifIns = $pdo->prepare("
            INSERT INTO notifications (user_id, type, message, action_payload, created_at)
            VALUES (?, 'maintenance_updated', ?, ?, ?)
        ");
        $actionPayload = json_encode(['maintenance_id' => (int) $maintId, 'date' => $maint['date_start'], 'type' => 'maintenance_updated']);
        foreach ($otherUsers as $ou) {
            $notifIns->execute([$ou['id'], $notifMsg, $actionPayload, $now->format('Y-m-d H:i:s')]);
        }

        sendWebPushToAll($pdo, $user['id'], 'ChaletWeShare: Unterhalt angepasst', $notifMsg, [
            'maintenance_id' => (int) $maintId,
            'date' => $maint['date_start'],
            'type' => 'maintenance_updated'
        ]);

        jsonResponse([
            'success' => true,
            'message' => 'Unterhalt erfolgreich aktualisiert.',
            'maintenance' => [
                'id' => (int) $maintId,
                'user_id' => (int) $user['id'],
                'user_name' => $user['name'],
                'date_start' => $maint['date_start'],
                'date_end' => $maint['date_end'],
                'half_day' => $halfDay,
                'reason' => $reason
            ]
        ]);
        break;

    case 'delete_maintenance':
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $maintId = (int) ($input['maintenance_id'] ?? 0);
        if (!$maintId) {
            jsonResponse(['success' => false, 'error' => 'Blockierungs-ID erforderlich.'], 400);
        }

        $chkStmt = $pdo->prepare("SELECT id, user_id, date_start, date_end, reason FROM maintenance_blocks WHERE id = ?");
        $chkStmt->execute([$maintId]);
        $maint = $chkStmt->fetch();

        if (!$maint) {
            jsonResponse(['success' => false, 'error' => 'Blockierung nicht gefunden.'], 404);
        }

        if ($maint['user_id'] != $user['id']) {
            jsonResponse(['success' => false, 'error' => 'Nur der Ersteller kann diese Blockierung entfernen.'], 403);
        }

        $delStmt = $pdo->prepare("DELETE FROM maintenance_blocks WHERE id = ?");
        $delStmt->execute([$maintId]);

        // Notify other family members and dispatch Web Push
        $now = new DateTime('now', new DateTimeZone('Europe/Zurich'));
        $otherUsersStmt = $pdo->prepare("SELECT id FROM users WHERE id != ?");
        $otherUsersStmt->execute([$user['id']]);
        $notifMsg = "Unterhaltsblockierung aufgehoben: {$user['name']} hat Unterhalt ({$maint['date_start']} bis {$maint['date_end']}) freigegeben.";
        $notifIns = $pdo->prepare("
            INSERT INTO notifications (user_id, type, message, action_payload, created_at)
            VALUES (?, 'maintenance_deleted', ?, ?, ?)
        ");
        $actionPayload = json_encode(['maintenance_id' => (int) $maintId, 'date' => $maint['date_start'], 'type' => 'maintenance_deleted']);
        foreach ($otherUsersStmt->fetchAll() as $ou) {
            $notifIns->execute([$ou['id'], $notifMsg, $actionPayload, $now->format('Y-m-d H:i:s')]);
        }

        sendWebPushToAll($pdo, $user['id'], 'ChaletWeShare: Unterhalt entfernt', $notifMsg, [
            'maintenance_id' => (int) $maintId,
            'date' => $maint['date_start'],
            'type' => 'maintenance_deleted'
        ]);

        jsonResponse(['success' => true, 'message' => 'Unterhaltsblockierung entfernt.']);
        break;

    case 'veto':
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $resId = (int) ($input['reservation_id'] ?? 0);
        $chkStmt = $pdo->prepare("SELECT id, user_id, date_start, date_end, status, veto_deadline FROM reservations WHERE id = ?");
        $chkStmt->execute([$resId]);
        $res = $chkStmt->fetch();

        if (!$res) {
            jsonResponse(['success' => false, 'error' => 'Reservation nicht gefunden.'], 404);
        }

        if ($res['user_id'] == $user['id']) {
            jsonResponse(['success' => false, 'error' => 'Du kannst kein Veto gegen deine eigene Reservation einlegen.'], 400);
        }

        if ($res['status'] !== 'pending') {
            jsonResponse(['success' => false, 'error' => 'Veto nur bei ausstehenden Reservationen möglich.'], 400);
        }

        $now = new DateTime('now', new DateTimeZone('Europe/Zurich'));
        if (!empty($res['veto_deadline']) && $now->format('Y-m-d H:i:s') > $res['veto_deadline']) {
            jsonResponse(['success' => false, 'error' => 'Die Veto-Frist ist bereits abgelaufen.'], 400);
        }

        // Record veto
        $vetoIns = $pdo->prepare("INSERT INTO vetoes (reservation_id, user_id, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)");
        $vetoIns->execute([$resId, $user['id']]);

        // Update reservation status to vetoed
        $updStmt = $pdo->prepare("UPDATE reservations SET status = 'vetoed' WHERE id = ?");
        $updStmt->execute([$resId]);

        // Insert notification for reservation owner
        $ownerMsg = "⚠️ {$user['name']} hat ein Veto gegen deine Reservation ({$res['date_start']} bis {$res['date_end']}) eingelegt. Bitte im Dashboard prüfen.";
        $vetoPayload = json_encode([
            'reservation_id' => (int) $resId,
            'date' => $res['date_start'],
            'type' => 'veto'
        ]);

        $notifIns = $pdo->prepare("INSERT INTO notifications (user_id, type, message, related_reservation_id, action_payload, created_at) VALUES (?, 'veto', ?, ?, ?, ?)");
        $notifIns->execute([$res['user_id'], $ownerMsg, $resId, $vetoPayload, $now->format('Y-m-d H:i:s')]);

        // Dispatch Web Push to the reservation owner
        sendWebPushToUser($pdo, $res['user_id'], 'ChaletWeShare: Veto eingelegt', $ownerMsg, [
            'reservation_id' => $resId,
            'date' => $res['date_start'],
            'type' => 'veto',
            'status' => 'vetoed'
        ]);

        // Also broadcast notification and Web Push to all other siblings so everyone's calendar updates immediately
        $otherSiblingsStmt = $pdo->prepare("SELECT id FROM users WHERE id NOT IN (?, ?)");
        $otherSiblingsStmt->execute([$user['id'], $res['user_id']]);
        $siblingMsg = "⚠️ {$user['name']} hat ein Veto gegen die Reservation ({$res['date_start']} bis {$res['date_end']}) eingelegt.";
        foreach ($otherSiblingsStmt->fetchAll() as $s) {
            $notifIns->execute([$s['id'], $siblingMsg, $resId, $vetoPayload, $now->format('Y-m-d H:i:s')]);
        }

        sendWebPushToAll($pdo, [$user['id'], $res['user_id']], 'ChaletWeShare: Veto eingelegt', $siblingMsg, [
            'reservation_id' => $resId,
            'date' => $res['date_start'],
            'type' => 'veto',
            'status' => 'vetoed'
        ]);

        jsonResponse([
            'success' => true,
            'message' => 'Veto erfolgreich registriert.',
            'reservation_id' => $resId,
            'status' => 'vetoed'
        ]);
        break;

    case 'withdraw_veto':
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $resId = (int) ($input['reservation_id'] ?? 0);
        if (!$resId) {
            jsonResponse(['success' => false, 'error' => 'Reservations-ID erforderlich.'], 400);
        }

        $delVeto = $pdo->prepare("DELETE FROM vetoes WHERE reservation_id = ? AND user_id = ?");
        $delVeto->execute([$resId, $user['id']]);

        // Clear any proposal by this user
        $delProp = $pdo->prepare("DELETE FROM conflict_proposals WHERE reservation_id = ? AND proposer_user_id = ?");
        $delProp->execute([$resId, $user['id']]);

        // Check if other vetoes remain
        $remCheck = $pdo->prepare("SELECT COUNT(*) FROM vetoes WHERE reservation_id = ?");
        $remCheck->execute([$resId]);
        $remainingVetoes = (int) $remCheck->fetchColumn();

        if ($remainingVetoes === 0) {
            // Check approvals
            $apprCountStmt = $pdo->prepare("SELECT COUNT(*) FROM reservation_approvals WHERE reservation_id = ?");
            $apprCountStmt->execute([$resId]);
            $apprCount = (int) $apprCountStmt->fetchColumn();
            $totalUsers = (int) $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
            $required = max(1, $totalUsers - 1);

            $newStatus = ($apprCount >= $required) ? 'booked' : 'pending';
            $upd = $pdo->prepare("UPDATE reservations SET status = ? WHERE id = ?");
            $upd->execute([$newStatus, $resId]);
        }

        // Notify reservation owner
        $chkOwner = $pdo->prepare("SELECT user_id, date_start, date_end FROM reservations WHERE id = ?");
        $chkOwner->execute([$resId]);
        $resObj = $chkOwner->fetch();
        if ($resObj) {
            $now = new DateTime('now', new DateTimeZone('Europe/Zurich'));
            $msg = "✅ {$user['name']} hat das Veto gegen deine Reservation ({$resObj['date_start']} bis {$resObj['date_end']}) zurückgezogen.";
            $withdrawnPayload = json_encode([
                'reservation_id' => (int) $resId,
                'date' => $resObj['date_start'],
                'type' => 'veto_withdrawn'
            ]);
            $notifIns = $pdo->prepare("INSERT INTO notifications (user_id, type, message, related_reservation_id, action_payload, created_at) VALUES (?, 'veto_withdrawn', ?, ?, ?, ?)");
            $notifIns->execute([$resObj['user_id'], $msg, $resId, $withdrawnPayload, $now->format('Y-m-d H:i:s')]);
            sendWebPushToUser($pdo, $resObj['user_id'], 'ChaletWeShare: Veto zurückgezogen', $msg, [
                'reservation_id' => $resId,
                'date' => $resObj['date_start'],
                'type' => 'veto_withdrawn'
            ]);
        }

        jsonResponse([
            'success' => true,
            'message' => 'Veto erfolgreich zurückgezogen.'
        ]);
        break;

    case 'propose_resolution':
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $resId = (int) ($input['reservation_id'] ?? 0);
        $proposalType = trim($input['proposal_type'] ?? 'shared'); // 'shared' | 'rng'

        $chkStmt = $pdo->prepare("SELECT id, user_id, date_start, date_end, status FROM reservations WHERE id = ?");
        $chkStmt->execute([$resId]);
        $res = $chkStmt->fetch();

        if (!$res) {
            jsonResponse(['success' => false, 'error' => 'Reservation nicht gefunden.'], 404);
        }

        if ($res['status'] !== 'vetoed') {
            jsonResponse(['success' => false, 'error' => 'Vorschlag nur bei Status Veto möglich.'], 400);
        }

        $vetoChk = $pdo->prepare("SELECT COUNT(*) FROM vetoes WHERE reservation_id = ? AND user_id = ?");
        $vetoChk->execute([$resId, $user['id']]);
        $isVetoer = ((int)$vetoChk->fetchColumn()) > 0;
        $isRequester = ($res['user_id'] == $user['id']);

        if (!$isVetoer && !$isRequester) {
            jsonResponse(['success' => false, 'error' => 'Nur Konfliktparteien können Vorschläge einreichen.'], 403);
        }

        $now = new DateTime('now', new DateTimeZone('Europe/Zurich'));
        $nowStr = $now->format('Y-m-d H:i:s');

        $delProp = $pdo->prepare("DELETE FROM conflict_proposals WHERE reservation_id = ?");
        $delProp->execute([$resId]);

        $insProp = $pdo->prepare("INSERT INTO conflict_proposals (reservation_id, proposer_user_id, proposal_type, created_at) VALUES (?, ?, ?, ?)");
        $insProp->execute([$resId, $user['id'], $proposalType, $nowStr]);

        $propLabel = $proposalType === 'shared' ? 'Doppelnutzung' : 'Losentscheid (RNG)';
        $chatMsg = "💡 {$user['name']} schlägt {$propLabel} vor.";
        $insChat = $pdo->prepare("INSERT INTO chat_messages (reservation_id, user_id, message, created_at) VALUES (?, ?, ?, ?)");
        $insChat->execute([$resId, $user['id'], $chatMsg, $nowStr]);

        // Target opponent: if requester proposed, notify vetoers; if vetoer proposed, notify requester
        if ($isRequester) {
            $vStmt = $pdo->prepare("SELECT DISTINCT user_id FROM vetoes WHERE reservation_id = ?");
            $vStmt->execute([$resId]);
            $targets = $vStmt->fetchAll(PDO::FETCH_COLUMN);
        } else {
            $targets = [(int)$res['user_id']];
        }

        $propPayload = json_encode([
            'reservation_id' => (int) $resId,
            'date' => $res['date_start'],
            'proposal_type' => $proposalType,
            'type' => 'conflict_proposal'
        ]);
        $notifIns = $pdo->prepare("INSERT INTO notifications (user_id, type, message, related_reservation_id, action_payload, created_at) VALUES (?, 'conflict_proposal', ?, ?, ?, ?)");
        $notifMsg = "💬 {$user['name']} hat einen Lösungsvorschlag ({$propLabel}) für euren Konflikt ({$res['date_start']} bis {$res['date_end']}) vorgeschlagen. Bitte im Dashboard antworten.";
        foreach ($targets as $tid) {
            if ($tid != $user['id']) {
                $notifIns->execute([$tid, $notifMsg, $resId, $propPayload, $nowStr]);
                sendWebPushToUser($pdo, $tid, 'ChaletWeShare: Lösungsvorschlag', $notifMsg, [
                    'reservation_id' => $resId,
                    'date' => $res['date_start'],
                    'type' => 'conflict_proposal'
                ]);
            }
        }

        jsonResponse([
            'success' => true,
            'message' => 'Lösungsvorschlag erfolgreich eingereicht.',
            'proposal' => [
                'proposer_user_id' => (int)$user['id'],
                'proposer_user_name' => $user['name'],
                'proposer_user_avatar' => $user['avatar'],
                'proposal_type' => $proposalType,
                'created_at' => $nowStr
            ]
        ]);
        break;

    case 'resolve':
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $resId = (int) ($input['reservation_id'] ?? 0);
        $resType = trim($input['resolution_type'] ?? 'shared'); // 'shared', 'rng', 'withdraw'
        $winnerUserId = !empty($input['winner_user_id']) ? (int) $input['winner_user_id'] : null;

        $chkStmt = $pdo->prepare("SELECT id, user_id, date_start, date_end, status FROM reservations WHERE id = ?");
        $chkStmt->execute([$resId]);
        $res = $chkStmt->fetch();

        if (!$res) {
            jsonResponse(['success' => false, 'error' => 'Reservation nicht gefunden.'], 404);
        }

        if ($res['status'] !== 'vetoed') {
            jsonResponse(['success' => false, 'error' => 'Nur angefochtene Reservationen (Status: Veto) können gelöst werden.'], 400);
        }

        // Enforce logical ownership / resolution authority:
        $isRequester = ($res['user_id'] == $user['id']);
        if (!$isRequester) {
            if ($resType === 'shared') {
                // Sibling can only resolve if requester proposed 'shared'
                $chkProp = $pdo->prepare("SELECT proposal_type, proposer_user_id FROM conflict_proposals WHERE reservation_id = ?");
                $chkProp->execute([$resId]);
                $propRow = $chkProp->fetch();
                if (!$propRow || $propRow['proposal_type'] !== 'shared' || $propRow['proposer_user_id'] != $res['user_id']) {
                    jsonResponse(['success' => false, 'error' => 'Bitte schlage Doppelnutzung vor. Der Erstanfragende entscheidet über die Annahme.'], 403);
                }
            } elseif ($resType === 'rng') {
                jsonResponse(['success' => false, 'error' => 'Nur der Erstanfragende besitzt die Befugnis, den Losentscheid zu würfeln.'], 403);
            } elseif ($resType === 'withdraw') {
                jsonResponse(['success' => false, 'error' => 'Du kannst nur dein eigenes Veto zurückziehen, nicht die Reservation.'], 403);
            }
        }

        $now = new DateTime('now', new DateTimeZone('Europe/Zurich'));

        if ($resType === 'shared') {
            // Both siblings use the chalet
            $upd = $pdo->prepare("UPDATE reservations SET status = 'booked', resolved_at = ? WHERE id = ?");
            $upd->execute([$now->format('Y-m-d H:i:s'), $resId]);
            $notifMsg = "🤝 Doppelnutzung vereinbart: {$user['name']} und alle Beteiligten teilen sich das Chalet ({$res['date_start']} bis {$res['date_end']}).";
        } elseif ($resType === 'rng') {
            // Dice roll winner gets the booking
            $newOwner = $winnerUserId ?: $user['id'];
            $upd = $pdo->prepare("UPDATE reservations SET status = 'booked', user_id = ?, resolved_at = ? WHERE id = ?");
            $upd->execute([$newOwner, $now->format('Y-m-d H:i:s'), $resId]);

            $winnerName = '';
            if ($winnerUserId) {
                $wStmt = $pdo->prepare("SELECT name FROM users WHERE id = ?");
                $wStmt->execute([$winnerUserId]);
                $winnerName = $wStmt->fetchColumn();
            }
            $winnerLabel = $winnerName ? " an {$winnerName}" : '';
            $notifMsg = "🎲 Losentscheid abgeschlossen: Die Reservation ({$res['date_start']} bis {$res['date_end']}) geht{$winnerLabel}.";
        } elseif ($resType === 'withdraw') {
            $upd = $pdo->prepare("UPDATE reservations SET status = 'cancelled', resolved_at = ? WHERE id = ?");
            $upd->execute([$now->format('Y-m-d H:i:s'), $resId]);
            $notifMsg = "↩️ Reservation ({$res['date_start']} bis {$res['date_end']}) wurde einvernehmlich zurückgezogen. Die Daten sind wieder frei.";
        }

        // Record resolution in conflict_resolutions
        try {
            $resIns = $pdo->prepare("INSERT INTO conflict_resolutions (reservation_id, resolution_type, winner_user_id, resolved_at) VALUES (?, ?, ?, ?)");
            $resIns->execute([$resId, $resType === 'withdraw' ? 'chat' : $resType, $winnerUserId, $now->format('Y-m-d H:i:s')]);
        } catch (Exception $e) {}

        // Clear any active conflict proposals
        try {
            $delProp = $pdo->prepare("DELETE FROM conflict_proposals WHERE reservation_id = ?");
            $delProp->execute([$resId]);
        } catch (Exception $e) {}

        // Notify ONLY involved parties (reservation owner, vetoers, and winner if RNG), excluding the acting user
        $vetoersStmt = $pdo->prepare("SELECT DISTINCT user_id FROM vetoes WHERE reservation_id = ?");
        $vetoersStmt->execute([$resId]);
        $vetoUserIds = $vetoersStmt->fetchAll(PDO::FETCH_COLUMN);

        $involvedUserIds = array_unique(array_filter(array_merge(
            [(int)$res['user_id']],
            $winnerUserId ? [(int)$winnerUserId] : [],
            array_map('intval', $vetoUserIds)
        )));

        $resolvedPayload = json_encode([
            'reservation_id' => (int) $resId,
            'date' => $res['date_start'],
            'resolution_type' => $resType,
            'type' => 'resolved'
        ]);
        $notifIns = $pdo->prepare("INSERT INTO notifications (user_id, type, message, related_reservation_id, action_payload, created_at) VALUES (?, 'resolved', ?, ?, ?, ?)");
        foreach ($involvedUserIds as $targetUserId) {
            if ($targetUserId != $user['id']) {
                $notifIns->execute([$targetUserId, $notifMsg, $resId, $resolvedPayload, $now->format('Y-m-d H:i:s')]);
                sendWebPushToUser($pdo, $targetUserId, 'ChaletWeShare: Konflikt gelöst', $notifMsg, [
                    'reservation_id' => $resId,
                    'date' => $res['date_start'],
                    'type' => 'resolved'
                ]);
            }
        }

        jsonResponse([
            'success' => true,
            'message' => 'Konflikt erfolgreich gelöst.',
            'resolution_type' => $resType
        ]);
        break;

    case 'approve':
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $resId = (int) ($input['reservation_id'] ?? 0);
        if (!$resId) {
            jsonResponse(['success' => false, 'error' => 'Reservations-ID erforderlich.'], 400);
        }

        $chkStmt = $pdo->prepare("
            SELECT r.id, r.user_id, r.date_start, r.date_end, r.status, r.veto_deadline, u.name as user_name
            FROM reservations r
            JOIN users u ON r.user_id = u.id
            WHERE r.id = ?
        ");
        $chkStmt->execute([$resId]);
        $res = $chkStmt->fetch();

        if (!$res) {
            jsonResponse(['success' => false, 'error' => 'Reservation nicht gefunden.'], 404);
        }

        if ($res['status'] !== 'pending') {
            jsonResponse(['success' => false, 'error' => 'Nur ausstehende Reservationen können genehmigt werden.'], 400);
        }

        if ($res['user_id'] == $user['id']) {
            jsonResponse(['success' => false, 'error' => 'Du kannst deine eigene Reservation nicht genehmigen.'], 400);
        }

        $now = new DateTime('now', new DateTimeZone('Europe/Zurich'));
        if (!empty($res['veto_deadline']) && $now->format('Y-m-d H:i:s') > $res['veto_deadline']) {
            jsonResponse(['success' => false, 'error' => 'Die Veto-Frist ist bereits abgelaufen.'], 400);
        }

        // Check if user has already approved
        $existAppr = $pdo->prepare("SELECT COUNT(*) FROM reservation_approvals WHERE reservation_id = ? AND user_id = ?");
        $existAppr->execute([$resId, $user['id']]);
        if ((int)$existAppr->fetchColumn() === 0) {
            $insAppr = $pdo->prepare("INSERT INTO reservation_approvals (reservation_id, user_id) VALUES (?, ?)");
            $insAppr->execute([$resId, $user['id']]);
        }

        // Count total other users (all users excluding the reservation owner)
        $otherUsersStmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE id != ?");
        $otherUsersStmt->execute([(int)$res['user_id']]);
        $otherUsersCount = (int)$otherUsersStmt->fetchColumn();

        // Count current approvals for this reservation
        $apprCountStmt = $pdo->prepare("SELECT COUNT(*) FROM reservation_approvals WHERE reservation_id = ?");
        $apprCountStmt->execute([$resId]);
        $currentApprCount = (int)$apprCountStmt->fetchColumn();

        $allApproved = ($currentApprCount >= $otherUsersCount && $otherUsersCount > 0);
        $nowStr = $now->format('Y-m-d H:i:s');

        if ($allApproved) {
            // All siblings gave thumbs up: promote immediately to booked!
            $upd = $pdo->prepare("UPDATE reservations SET status = 'booked', resolved_at = ? WHERE id = ?");
            $upd->execute([$nowStr, $resId]);

            // Clean up any pending partial approval notifications for this reservation
            try {
                $delOldAppr = $pdo->prepare("DELETE FROM notifications WHERE user_id = ? AND type = 'approval' AND related_reservation_id = ?");
                $delOldAppr->execute([$res['user_id'], $resId]);
            } catch (\Throwable $e) {}

            // Notify the reservation owner
            $confMsg = "🎉 Alle Geschwister einverstanden! Deine Reservation ({$res['date_start']} bis {$res['date_end']}) ist jetzt fest gebucht.";
            $allApprovedPayload = json_encode([
                'reservation_id' => (int) $resId,
                'date' => $res['date_start'],
                'type' => 'all_approved'
            ]);
            $notifIns = $pdo->prepare("INSERT INTO notifications (user_id, type, message, related_reservation_id, action_payload, created_at) VALUES (?, 'all_approved', ?, ?, ?, ?)");
            $notifIns->execute([$res['user_id'], $confMsg, $resId, $allApprovedPayload, $nowStr]);
            sendWebPushToUser($pdo, $res['user_id'], 'ChaletWeShare: Fest gebucht', $confMsg, [
                'reservation_id' => $resId,
                'date' => $res['date_start'],
                'tag' => 'res-' . $resId,
                'type' => 'all_approved',
                'status' => 'booked'
            ]);

            // Also broadcast Web Push to all other siblings so their calendar patterns turn cobalt blue immediately
            $allSiblingsMsg = "🎉 Reservation von {$res['user_name']} ({$res['date_start']} bis {$res['date_end']}) ist jetzt von allen bestätigt und fest gebucht.";
            sendWebPushToAll($pdo, [$res['user_id'], $user['id']], 'ChaletWeShare: Fest gebucht', $allSiblingsMsg, [
                'reservation_id' => $resId,
                'date' => $res['date_start'],
                'tag' => 'res-' . $resId,
                'type' => 'all_approved',
                'status' => 'booked'
            ]);

            jsonResponse([
                'success' => true,
                'status' => 'booked',
                'all_approved' => true,
                'approvals_count' => $currentApprCount,
                'required_approvals' => $otherUsersCount,
                'message' => 'Alle Geschwister haben zugestimmt! Die Reservation ist jetzt fest gebucht.'
            ]);
        } else {
            // Partial approval recorded: update/consolidate in-app notification without loud Web Push spam
            try {
                $delOldAppr = $pdo->prepare("DELETE FROM notifications WHERE user_id = ? AND type = 'approval' AND related_reservation_id = ? AND is_read = 0");
                $delOldAppr->execute([$res['user_id'], $resId]);
            } catch (\Throwable $e) {}

            $apprPayload = json_encode([
                'reservation_id' => (int) $resId,
                'date' => $res['date_start'],
                'type' => 'approval'
            ]);
            $notifyOwner = $pdo->prepare("INSERT INTO notifications (user_id, type, message, related_reservation_id, action_payload, created_at) VALUES (?, 'approval', ?, ?, ?, ?)");
            $ownerMsg = "👍 {$user['name']} hat deiner Reservation ({$res['date_start']} bis {$res['date_end']}) zugestimmt ({$currentApprCount}/{$otherUsersCount}).";
            $notifyOwner->execute([$res['user_id'], $ownerMsg, $resId, $apprPayload, $nowStr]);

            // Note: Loud Web Push is intentionally omitted here to prevent vibration spam for each sibling.
            // Full celebratory Web Push is triggered when allApproved is reached.

            jsonResponse([
                'success' => true,
                'status' => 'pending',
                'all_approved' => false,
                'approvals_count' => $currentApprCount,
                'required_approvals' => $otherUsersCount,
                'message' => "Zustimmung erfasst ({$currentApprCount}/{$otherUsersCount})."
            ]);
        }
        break;

    default:
        jsonResponse(['success' => false, 'error' => 'Unbekannte Aktion.'], 400);
        break;
}
} catch (\Throwable $e) {
    error_log("reservations.php fatal error: " . $e->getMessage());
    jsonResponse(['success' => false, 'error' => 'Datenbank- / Serverfehler: ' . $e->getMessage()], 500);
}
