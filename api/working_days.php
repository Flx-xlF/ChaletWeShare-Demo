<?php
/**
 * ChaletWeShare — Working Days API (Frühjahrsputz / Einwintern)
 * Supports single-date scheduling and 3-date proposals with voting & finalization.
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/push.php';

date_default_timezone_set('Europe/Zurich');

$input = getJsonInput();
$action = $input['action'] ?? ($_GET['action'] ?? '');

$pdo = getDbConnection();

switch ($action) {
    case 'list':
        requireGateOrUser($pdo, $input);

        $stmt = $pdo->query("
            SELECT w.id, w.user_id, w.date, w.season, w.status, w.proposed_dates, w.created_at,
                   u.name as user_name, u.avatar as user_avatar
            FROM working_days w
            JOIN users u ON w.user_id = u.id
            ORDER BY COALESCE(w.date, w.created_at) ASC
        ");
        $workingDays = $stmt->fetchAll();

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
                $dec = is_string($row['votes']) ? json_decode($row['votes'], true) : $row['votes'];
                if (is_array($dec)) $votes = $dec;
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
            $rsvps = $rsvpMap[$wd['id']] ?? [];
            $wd['rsvps'] = $rsvps;

            // If in proposal phase, compute vote tallies per proposed date
            if ($wd['status'] === 'proposed' && !empty($proposed)) {
                $tallies = [];
                foreach ($proposed as $pDate) {
                    $tallies[$pDate] = [
                        'yes' => 0,
                        'maybe' => 0,
                        'no' => 0,
                        'pending' => 0,
                        'voters' => []
                    ];
                }

                foreach ($rsvps as $r) {
                    $uVotes = $r['votes'] ?? [];
                    foreach ($proposed as $pDate) {
                        $v = $uVotes[$pDate] ?? null;
                        if ($v === 'yes') $tallies[$pDate]['yes']++;
                        elseif ($v === 'maybe') $tallies[$pDate]['maybe']++;
                        elseif ($v === 'no') $tallies[$pDate]['no']++;
                        else $tallies[$pDate]['pending']++;

                        if ($v) {
                            $tallies[$pDate]['voters'][] = [
                                'user_id' => $r['user_id'],
                                'user_name' => $r['user_name'],
                                'user_avatar' => $r['user_avatar'],
                                'vote' => $v
                            ];
                        }
                    }
                }
                $wd['vote_tallies'] = $tallies;
            }
        }
        unset($wd);

        jsonResponse([
            'success' => true,
            'working_days' => $workingDays
        ]);
        break;

    case 'create':
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            $userId = (int)($input['user_id'] ?? 0);
            if ($userId && $syncToken) {
                $user = authenticateUserById($pdo, $userId, $syncToken);
            }
        }
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $season = trim($input['season'] ?? 'spring');
        if (!in_array($season, ['spring', 'autumn'], true)) {
            jsonResponse(['success' => false, 'error' => 'Saison muss "spring" oder "autumn" sein.'], 400);
        }

        // Support array of proposed dates OR single date
        $datesInput = $input['dates'] ?? null;
        if (!is_array($datesInput) && !empty($input['date'])) {
            $datesInput = [$input['date']];
        }

        if (!is_array($datesInput) || count($datesInput) === 0) {
            jsonResponse(['success' => false, 'error' => 'Mindestens ein Datum muss angegeben werden.'], 400);
        }

        // Clean & deduplicate dates (max 3)
        $cleanDates = [];
        foreach ($datesInput as $d) {
            $dt = trim((string)$d);
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dt)) {
                jsonResponse(['success' => false, 'error' => "Ungültiges Datumsformat ($dt)."], 400);
            }
            if (!in_array($dt, $cleanDates, true)) {
                $cleanDates[] = $dt;
            }
        }

        if (count($cleanDates) > 3) {
            $cleanDates = array_slice($cleanDates, 0, 3);
        }

        $now = new DateTime('now', new DateTimeZone('Europe/Zurich'));
        $todayISO = $now->format('Y-m-d');
        $nowStr = $now->format('Y-m-d H:i:s');

        foreach ($cleanDates as $dt) {
            if ($dt < $todayISO) {
                jsonResponse(['success' => false, 'error' => "Datum {$dt} kann nicht in der Vergangenheit liegen."], 400);
            }

            // Collision check with reservations
            $resCheck = $pdo->prepare("
                SELECT r.id, r.date_start, r.date_end, u.name as user_name
                FROM reservations r
                JOIN users u ON r.user_id = u.id
                WHERE r.status IN ('pending', 'booked')
                  AND r.date_start <= ?
                  AND r.date_end >= ?
            ");
            $resCheck->execute([$dt, $dt]);
            $collision = $resCheck->fetch();
            if ($collision) {
                jsonResponse([
                    'success' => false,
                    'error' => "Konflikt: Am {$dt} liegt bereits eine Reservation von {$collision['user_name']} ({$collision['date_start']} bis {$collision['date_end']})."
                ], 409);
            }

            // Collision check with existing finalized working day
            $existCheck = $pdo->prepare("SELECT id, season FROM working_days WHERE date = ?");
            $existCheck->execute([$dt]);
            $existing = $existCheck->fetch();
            if ($existing) {
                jsonResponse([
                    'success' => false,
                    'error' => "Für {$dt} ist bereits ein fester Arbeitstag eingetragen."
                ], 409);
            }
        }

        $isProposal = count($cleanDates) > 1 || !empty($input['is_proposal']);
        $seasonLabel = $season === 'spring' ? 'Frühjahrsputz' : 'Einwintern';

        if ($isProposal) {
            // Sort proposed dates chronologically
            sort($cleanDates);
            $status = 'proposed';
            $finalDate = null;
            $proposedJson = json_encode($cleanDates);

            $ins = $pdo->prepare("
                INSERT INTO working_days (user_id, date, season, status, proposed_dates, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $ins->execute([$user['id'], $finalDate, $season, $status, $proposedJson, $nowStr]);
            $workingDayId = (int)$pdo->lastInsertId();

            // Creator votes 'yes' for all their proposed dates
            $creatorVotes = [];
            foreach ($cleanDates as $d) {
                $creatorVotes[$d] = 'yes';
            }
            $creatorVotesJson = json_encode($creatorVotes);

            $rsvpIns = $pdo->prepare("
                INSERT INTO working_day_rsvps (working_day_id, user_id, status, votes, updated_at)
                VALUES (?, ?, 'yes', ?, ?)
            ");
            $rsvpIns->execute([$workingDayId, $user['id'], $creatorVotesJson, $nowStr]);

            // Notify other users: 1 non-spammy announcement
            $otherUsersStmt = $pdo->prepare("SELECT id FROM users WHERE id != ?");
            $otherUsersStmt->execute([$user['id']]);
            $otherUsers = $otherUsersStmt->fetchAll();

            $dateCount = count($cleanDates);
            $formattedDatesList = array_map(function($d) {
                $p = explode('-', $d);
                return "{$p[2]}.{$p[1]}.";
            }, $cleanDates);
            $dateSummary = implode(', ', $formattedDatesList);

            $notifMsg = "Terminfindung: {$user['name']} schlägt {$dateCount} Termine für den {$seasonLabel} vor ({$dateSummary}). Welcher passt dir?";
            $notifIns = $pdo->prepare("
                INSERT INTO notifications (user_id, type, message, action_payload, created_at)
                VALUES (?, 'working_day_proposal', ?, ?, ?)
            ");
            $actionPayload = json_encode([
                'working_day_id' => $workingDayId,
                'proposed_dates' => $cleanDates,
                'season' => $season
            ]);
            foreach ($otherUsers as $ou) {
                $notifIns->execute([$ou['id'], $notifMsg, $actionPayload, $nowStr]);
            }

            // Web Push to all other siblings
            sendWebPushToAll(
                $pdo,
                $user['id'],
                "ChaletWeShare: {$seasonLabel} Terminvorschlag",
                "{$user['name']} schlägt {$dateCount} Daten für den {$seasonLabel} vor. Stimme jetzt in der App ab!",
                ['type' => 'working_day_proposal', 'working_day_id' => $workingDayId]
            );

            jsonResponse([
                'success' => true,
                'working_day' => [
                    'id' => $workingDayId,
                    'user_id' => (int)$user['id'],
                    'user_name' => $user['name'],
                    'user_avatar' => $user['avatar'],
                    'date' => null,
                    'season' => $season,
                    'status' => 'proposed',
                    'proposed_dates' => $cleanDates,
                    'created_at' => $nowStr,
                    'rsvps' => [
                        [
                            'user_id' => (int)$user['id'],
                            'user_name' => $user['name'],
                            'user_avatar' => $user['avatar'],
                            'status' => 'yes',
                            'votes' => $creatorVotes,
                            'updated_at' => $nowStr
                        ]
                    ]
                ]
            ], 201);
        } else {
            // Direct single-date scheduling (finalized)
            $finalDate = $cleanDates[0];
            $status = 'finalized';

            $ins = $pdo->prepare("
                INSERT INTO working_days (user_id, date, season, status, proposed_dates, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $ins->execute([$user['id'], $finalDate, $season, $status, json_encode([$finalDate]), $nowStr]);
            $workingDayId = (int)$pdo->lastInsertId();

            $rsvpIns = $pdo->prepare("
                INSERT INTO working_day_rsvps (working_day_id, user_id, status, votes, updated_at)
                VALUES (?, ?, 'yes', ?, ?)
            ");
            $rsvpIns->execute([$workingDayId, $user['id'], json_encode([$finalDate => 'yes']), $nowStr]);

            $dateParts = explode('-', $finalDate);
            $friendlyDate = "{$dateParts[2]}.{$dateParts[1]}.{$dateParts[0]}";

            $otherUsersStmt = $pdo->prepare("SELECT id FROM users WHERE id != ?");
            $otherUsersStmt->execute([$user['id']]);
            $otherUsers = $otherUsersStmt->fetchAll();

            $notifMsg = "{$seasonLabel} am {$friendlyDate}: {$user['name']} hat den Arbeitstag angesetzt. Bist du dabei?";
            $notifIns = $pdo->prepare("
                INSERT INTO notifications (user_id, type, message, action_payload, created_at)
                VALUES (?, 'working_day', ?, ?, ?)
            ");
            $actionPayload = json_encode(['working_day_id' => $workingDayId, 'date' => $finalDate]);
            foreach ($otherUsers as $ou) {
                $notifIns->execute([$ou['id'], $notifMsg, $actionPayload, $nowStr]);
            }

            sendWebPushToAll(
                $pdo,
                $user['id'],
                "ChaletWeShare: {$seasonLabel}",
                "{$user['name']} hat den Arbeitstag am {$friendlyDate} angesetzt. Bitte gib Bescheid!",
                ['type' => 'working_day', 'date' => $finalDate, 'working_day_id' => $workingDayId]
            );

            jsonResponse([
                'success' => true,
                'working_day' => [
                    'id' => $workingDayId,
                    'user_id' => (int)$user['id'],
                    'user_name' => $user['name'],
                    'user_avatar' => $user['avatar'],
                    'date' => $finalDate,
                    'season' => $season,
                    'status' => 'finalized',
                    'proposed_dates' => [$finalDate],
                    'created_at' => $nowStr,
                    'rsvps' => [
                        [
                            'user_id' => (int)$user['id'],
                            'user_name' => $user['name'],
                            'user_avatar' => $user['avatar'],
                            'status' => 'yes',
                            'votes' => [$finalDate => 'yes'],
                            'updated_at' => $nowStr
                        ]
                    ]
                ]
            ], 201);
        }
        break;

    case 'vote':
        // Cast votes for proposed dates (Doodle-style voting)
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            $userId = (int)($input['user_id'] ?? 0);
            if ($userId && $syncToken) {
                $user = authenticateUserById($pdo, $userId, $syncToken);
            }
        }
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $workingDayId = (int)($input['working_day_id'] ?? 0);
        $userVotes = $input['votes'] ?? [];

        if (!$workingDayId || !is_array($userVotes)) {
            jsonResponse(['success' => false, 'error' => 'Arbeitstag-ID oder Stimmen fehlen.'], 400);
        }

        $wdStmt = $pdo->prepare("SELECT id, user_id, season, status, proposed_dates FROM working_days WHERE id = ?");
        $wdStmt->execute([$workingDayId]);
        $wd = $wdStmt->fetch();
        if (!$wd) {
            jsonResponse(['success' => false, 'error' => 'Arbeitstag nicht gefunden.'], 404);
        }

        if (($wd['status'] ?? 'finalized') !== 'proposed') {
            jsonResponse(['success' => false, 'error' => 'Dieser Arbeitstag ist bereits final festgelegt.'], 400);
        }

        $proposed = [];
        if (!empty($wd['proposed_dates'])) {
            $dec = is_string($wd['proposed_dates']) ? json_decode($wd['proposed_dates'], true) : $wd['proposed_dates'];
            if (is_array($dec)) $proposed = $dec;
        }

        // Validate votes
        $cleanVotes = [];
        foreach ($proposed as $pDate) {
            $val = $userVotes[$pDate] ?? 'no';
            if (!in_array($val, ['yes', 'maybe', 'no'], true)) {
                $val = 'no';
            }
            $cleanVotes[$pDate] = $val;
        }

        $now = new DateTime('now', new DateTimeZone('Europe/Zurich'));
        $nowStr = $now->format('Y-m-d H:i:s');
        $votesJson = json_encode($cleanVotes);

        // Record or update user RSVP
        $checkRsvp = $pdo->prepare("SELECT id FROM working_day_rsvps WHERE working_day_id = ? AND user_id = ?");
        $checkRsvp->execute([$workingDayId, $user['id']]);
        $existingRsvp = $checkRsvp->fetch();

        // Overall status is 'yes' if they voted yes on at least one date, else 'no'
        $hasAnyYes = in_array('yes', $cleanVotes, true) || in_array('maybe', $cleanVotes, true);
        $overallStatus = $hasAnyYes ? 'yes' : 'no';

        if ($existingRsvp) {
            $update = $pdo->prepare("UPDATE working_day_rsvps SET status = ?, votes = ?, updated_at = ? WHERE id = ?");
            $update->execute([$overallStatus, $votesJson, $nowStr, $existingRsvp['id']]);
        } else {
            $insert = $pdo->prepare("INSERT INTO working_day_rsvps (working_day_id, user_id, status, votes, updated_at) VALUES (?, ?, ?, ?, ?)");
            $insert->execute([$workingDayId, $user['id'], $overallStatus, $votesJson, $nowStr]);
        }

        // Thoughtful Non-Spammy Notification tactic:
        // Do NOT send push notifications on every single vote click!
        // Only notify the creator when ALL siblings have now voted.
        $totalUsers = (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
        $votedCountStmt = $pdo->prepare("
            SELECT COUNT(*) FROM working_day_rsvps 
            WHERE working_day_id = ? AND votes IS NOT NULL
        ");
        $votedCountStmt->execute([$workingDayId]);
        $totalVoted = (int)$votedCountStmt->fetchColumn();

        if ($totalVoted >= $totalUsers) {
            // Check if creator was already notified that all have voted
            $seasonLabel = $wd['season'] === 'autumn' ? 'Einwintern' : 'Frühjahrsputz';
            $checkNotif = $pdo->prepare("
                SELECT COUNT(*) FROM notifications 
                WHERE user_id = ? AND type = 'working_day_all_voted' 
                  AND action_payload LIKE ?
            ");
            $checkNotif->execute([$wd['user_id'], "%\"working_day_id\":{$workingDayId}%"]);
            if ((int)$checkNotif->fetchColumn() === 0) {
                $completeMsg = "Alle Geschwister haben über die Termine für den {$seasonLabel} abgestimmt! Du kannst nun das finale Datum auswählen.";
                $insNotif = $pdo->prepare("
                    INSERT INTO notifications (user_id, type, message, action_payload, created_at)
                    VALUES (?, 'working_day_all_voted', ?, ?, ?)
                ");
                $actionPayload = json_encode(['working_day_id' => $workingDayId, 'season' => $wd['season']]);
                $insNotif->execute([$wd['user_id'], $completeMsg, $actionPayload, $nowStr]);

                sendWebPushToUser(
                    $pdo,
                    $wd['user_id'],
                    "ChaletWeShare: Abstimmung komplett! 📊",
                    $completeMsg,
                    ['type' => 'working_day_all_voted', 'working_day_id' => $workingDayId]
                );
            }
        }

        jsonResponse([
            'success' => true,
            'working_day_id' => $workingDayId,
            'user_id' => (int)$user['id'],
            'votes' => $cleanVotes,
            'updated_at' => $nowStr
        ]);
        break;

    case 'finalize':
        // Finalize a proposal by selecting the winning date
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            $userId = (int)($input['user_id'] ?? 0);
            if ($userId && $syncToken) {
                $user = authenticateUserById($pdo, $userId, $syncToken);
            }
        }
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $workingDayId = (int)($input['working_day_id'] ?? 0);
        $selectedDate = trim($input['selected_date'] ?? '');

        if (!$workingDayId || empty($selectedDate)) {
            jsonResponse(['success' => false, 'error' => 'Arbeitstag-ID oder Zieldatum fehlt.'], 400);
        }

        $wdStmt = $pdo->prepare("SELECT id, user_id, season, status, proposed_dates FROM working_days WHERE id = ?");
        $wdStmt->execute([$workingDayId]);
        $wd = $wdStmt->fetch();
        if (!$wd) {
            jsonResponse(['success' => false, 'error' => 'Arbeitstag nicht gefunden.'], 404);
        }

        $proposed = [];
        if (!empty($wd['proposed_dates'])) {
            $dec = is_string($wd['proposed_dates']) ? json_decode($wd['proposed_dates'], true) : $wd['proposed_dates'];
            if (is_array($dec)) $proposed = $dec;
        }

        if (!in_array($selectedDate, $proposed, true)) {
            jsonResponse(['success' => false, 'error' => 'Das gewählte Datum gehört nicht zu den vorgeschlagenen Terminen.'], 400);
        }

        // Collision check on selected date
        $resCheck = $pdo->prepare("
            SELECT r.id, r.date_start, r.date_end, u.name as user_name
            FROM reservations r
            JOIN users u ON r.user_id = u.id
            WHERE r.status IN ('pending', 'booked')
              AND r.date_start <= ?
              AND r.date_end >= ?
        ");
        $resCheck->execute([$selectedDate, $selectedDate]);
        $collision = $resCheck->fetch();
        if ($collision) {
            jsonResponse([
                'success' => false,
                'error' => "Konflikt: Am {$selectedDate} liegt bereits eine Reservation von {$collision['user_name']} ({$collision['date_start']} bis {$collision['date_end']})."
            ], 409);
        }

        $now = new DateTime('now', new DateTimeZone('Europe/Zurich'));
        $nowStr = $now->format('Y-m-d H:i:s');

        // Update working day to finalized
        $updWd = $pdo->prepare("UPDATE working_days SET date = ?, status = 'finalized' WHERE id = ?");
        $updWd->execute([$selectedDate, $workingDayId]);

        // Convert user votes for the selected date into final RSVP status
        $rsvpsStmt = $pdo->prepare("SELECT id, user_id, votes FROM working_day_rsvps WHERE working_day_id = ?");
        $rsvpsStmt->execute([$workingDayId]);
        $rsvps = $rsvpsStmt->fetchAll();

        $updRsvp = $pdo->prepare("UPDATE working_day_rsvps SET status = ?, updated_at = ? WHERE id = ?");
        foreach ($rsvps as $r) {
            $vMap = [];
            if (!empty($r['votes'])) {
                $dec = is_string($r['votes']) ? json_decode($r['votes'], true) : $r['votes'];
                if (is_array($dec)) $vMap = $dec;
            }
            $v = $vMap[$selectedDate] ?? 'no';
            $finalStatus = ($v === 'yes' || $v === 'maybe') ? 'yes' : 'no';
            $updRsvp->execute([$finalStatus, $nowStr, $r['id']]);
        }

        $seasonLabel = $wd['season'] === 'autumn' ? 'Einwintern' : 'Frühjahrsputz';
        $dateParts = explode('-', $selectedDate);
        $friendlyDate = "{$dateParts[2]}.{$dateParts[1]}.{$dateParts[0]}";

        // Celebratory notification to all siblings
        $allUsers = $pdo->query("SELECT id FROM users")->fetchAll();
        $notifMsg = "Termin steht! Der {$seasonLabel} findet am {$friendlyDate} statt. Trage ihn direkt in deinen Kalender ein!";
        $notifIns = $pdo->prepare("
            INSERT INTO notifications (user_id, type, message, action_payload, created_at)
            VALUES (?, 'working_day_finalized', ?, ?, ?)
        ");
        $actionPayload = json_encode([
            'working_day_id' => $workingDayId,
            'date' => $selectedDate,
            'season' => $wd['season']
        ]);
        foreach ($allUsers as $u) {
            $notifIns->execute([$u['id'], $notifMsg, $actionPayload, $nowStr]);
        }

        sendWebPushToAll(
            $pdo,
            $user['id'],
            "ChaletWeShare: Termin fixiert! 🗓️",
            "Der {$seasonLabel} findet am {$friendlyDate} statt. Schau in die App!",
            ['type' => 'working_day_finalized', 'working_day_id' => $workingDayId, 'date' => $selectedDate]
        );

        jsonResponse([
            'success' => true,
            'working_day_id' => $workingDayId,
            'date' => $selectedDate,
            'status' => 'finalized',
            'message' => "Arbeitstag erfolgreich auf {$friendlyDate} fixiert."
        ]);
        break;

    case 'rsvp':
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            $userId = (int)($input['user_id'] ?? 0);
            if ($userId && $syncToken) {
                $user = authenticateUserById($pdo, $userId, $syncToken);
            }
        }
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $workingDayId = (int)($input['working_day_id'] ?? 0);
        $status = trim($input['status'] ?? '');

        if (!$workingDayId) {
            jsonResponse(['success' => false, 'error' => 'Arbeitstag-ID fehlt.'], 400);
        }

        if (!in_array($status, ['yes', 'no'], true)) {
            jsonResponse(['success' => false, 'error' => 'Status muss "yes" oder "no" sein.'], 400);
        }

        // Verify working day exists
        $wdStmt = $pdo->prepare("SELECT id, user_id, date, season, status FROM working_days WHERE id = ?");
        $wdStmt->execute([$workingDayId]);
        $wd = $wdStmt->fetch();
        if (!$wd) {
            jsonResponse(['success' => false, 'error' => 'Arbeitstag nicht gefunden.'], 404);
        }

        $now = new DateTime('now', new DateTimeZone('Europe/Zurich'));
        $nowStr = $now->format('Y-m-d H:i:s');

        // Check if RSVP already exists
        $checkRsvp = $pdo->prepare("SELECT id FROM working_day_rsvps WHERE working_day_id = ? AND user_id = ?");
        $checkRsvp->execute([$workingDayId, $user['id']]);
        $existingRsvp = $checkRsvp->fetch();

        if ($existingRsvp) {
            $update = $pdo->prepare("UPDATE working_day_rsvps SET status = ?, updated_at = ? WHERE id = ?");
            $update->execute([$status, $nowStr, $existingRsvp['id']]);
        } else {
            $insert = $pdo->prepare("INSERT INTO working_day_rsvps (working_day_id, user_id, status, updated_at) VALUES (?, ?, ?, ?)");
            $insert->execute([$workingDayId, $user['id'], $status, $nowStr]);
        }

        // If user is responding and is not the creator, notify creator
        if ($user['id'] != $wd['user_id'] && !empty($wd['date'])) {
            $responseLabel = $status === 'yes' ? 'zugesagt!' : 'abgesagt.';
            $notifMsg = "{$user['name']} hat für den Arbeitstag am {$wd['date']} {$responseLabel}";
            $notifIns = $pdo->prepare("
                INSERT INTO notifications (user_id, type, message, action_payload, created_at)
                VALUES (?, 'working_day_rsvp', ?, ?, ?)
            ");
            $actionPayload = json_encode(['working_day_id' => $workingDayId, 'date' => $wd['date']]);
            $notifIns->execute([$wd['user_id'], $notifMsg, $actionPayload, $nowStr]);

            sendWebPushToUser(
                $pdo,
                $wd['user_id'],
                "ChaletWeShare: Arbeitstag Rückmeldung",
                $notifMsg,
                ['type' => 'working_day_rsvp', 'working_day_id' => $workingDayId, 'date' => $wd['date']]
            );
        }

        // Check if all siblings have responded
        $totalUsersStmt = $pdo->query("SELECT COUNT(*) FROM users");
        $totalUsers = (int)$totalUsersStmt->fetchColumn();

        $rsvpCountStmt = $pdo->prepare("SELECT COUNT(*) FROM working_day_rsvps WHERE working_day_id = ?");
        $rsvpCountStmt->execute([$workingDayId]);
        $totalRsvps = (int)$rsvpCountStmt->fetchColumn();

        if ($totalRsvps >= $totalUsers && !empty($wd['date'])) {
            $yesCountStmt = $pdo->prepare("SELECT COUNT(*) FROM working_day_rsvps WHERE working_day_id = ? AND status = 'yes'");
            $yesCountStmt->execute([$workingDayId]);
            $yesCount = (int)$yesCountStmt->fetchColumn();
            $noCount = $totalRsvps - $yesCount;

            $dateParts = explode('-', $wd['date']);
            $friendlyDate = "{$dateParts[2]}.{$dateParts[1]}.{$dateParts[0]}";
            $summaryMsg = "Alle haben auf den Arbeitstag am {$friendlyDate} geantwortet: {$yesCount} Zusage" . ($yesCount === 1 ? '' : 'n') . ", {$noCount} Absage" . ($noCount === 1 ? '' : 'n') . ".";

            $checkSummary = $pdo->prepare("
                SELECT COUNT(*) FROM notifications 
                WHERE user_id = ? AND type = 'working_day_summary' AND message LIKE ?
            ");
            $checkSummary->execute([$wd['user_id'], "%{$wd['date']}%"]);
            if ((int)$checkSummary->fetchColumn() === 0) {
                $summaryIns = $pdo->prepare("
                    INSERT INTO notifications (user_id, type, message, action_payload, created_at)
                    VALUES (?, 'working_day_summary', ?, ?, ?)
                ");
                $actionPayload = json_encode(['working_day_id' => $workingDayId, 'date' => $wd['date']]);
                $summaryIns->execute([$wd['user_id'], $summaryMsg, $actionPayload, $nowStr]);

                sendWebPushToUser(
                    $pdo,
                    $wd['user_id'],
                    "ChaletWeShare: Arbeitstag komplett",
                    $summaryMsg,
                    ['type' => 'working_day_summary', 'working_day_id' => $workingDayId, 'date' => $wd['date']]
                );
            }
        }

        jsonResponse([
            'success' => true,
            'working_day_id' => $workingDayId,
            'user_id' => (int)$user['id'],
            'user_name' => $user['name'],
            'user_avatar' => $user['avatar'],
            'status' => $status,
            'updated_at' => $nowStr
        ]);
        break;

    case 'delete':
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';
        $user = authenticateUser($pdo, $profileId, $syncToken);
        if (!$user) {
            $userId = (int)($input['user_id'] ?? 0);
            if ($userId && $syncToken) {
                $user = authenticateUserById($pdo, $userId, $syncToken);
            }
        }
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $workingDayId = (int)($input['working_day_id'] ?? 0);
        $chk = $pdo->prepare("SELECT id, user_id, date, season, status FROM working_days WHERE id = ?");
        $chk->execute([$workingDayId]);
        $wd = $chk->fetch();
        if (!$wd) {
            jsonResponse(['success' => false, 'error' => 'Arbeitstag nicht gefunden.'], 404);
        }

        // Delete RSVPs and working day
        $delRsvp = $pdo->prepare("DELETE FROM working_day_rsvps WHERE working_day_id = ?");
        $delRsvp->execute([$workingDayId]);

        $delWd = $pdo->prepare("DELETE FROM working_days WHERE id = ?");
        $delWd->execute([$workingDayId]);

        $now = new DateTime('now', new DateTimeZone('Europe/Zurich'));
        $nowStr = $now->format('Y-m-d H:i:s');

        // Notify other siblings
        $otherUsersStmt = $pdo->prepare("SELECT id FROM users WHERE id != ?");
        $otherUsersStmt->execute([$user['id']]);
        $seasonLabel = $wd['season'] === 'spring' ? 'Frühjahrsputz' : 'Einwintern';
        $dateLabel = !empty($wd['date']) ? "am {$wd['date']}" : "Terminvorschlag";
        $notifMsg = "Arbeitstag aufgehoben: {$user['name']} hat den {$seasonLabel} ({$dateLabel}) gelöscht.";
        $notifIns = $pdo->prepare("
            INSERT INTO notifications (user_id, type, message, action_payload, created_at)
            VALUES (?, 'working_day_deleted', ?, ?, ?)
        ");
        $actionPayload = json_encode(['working_day_id' => $workingDayId, 'season' => $wd['season']]);
        foreach ($otherUsersStmt->fetchAll() as $ou) {
            $notifIns->execute([$ou['id'], $notifMsg, $actionPayload, $nowStr]);
        }

        sendWebPushToAll(
            $pdo,
            $user['id'],
            "ChaletWeShare: Arbeitstag aufgehoben",
            "Der {$seasonLabel} ({$dateLabel}) wurde von {$user['name']} gelöscht.",
            [
                'type' => 'working_day_deleted',
                'working_day_id' => $workingDayId,
                'season' => $wd['season']
            ]
        );

        jsonResponse(['success' => true, 'message' => 'Arbeitstag erfolgreich gelöscht.']);
        break;

    default:
        jsonResponse(['success' => false, 'error' => 'Ungültige Aktion.'], 400);
        break;
}
