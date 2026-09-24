<?php
/**
 * ChaletWeShare — Statistics API
 * Calculates weekend days and total days per sibling dynamically for any requested calendar year.
 * Returns up to the last 3 years with bookings for multi-year analysis.
 */

require_once __DIR__ . '/db.php';

date_default_timezone_set('Europe/Zurich');

$input = getJsonInput();
$action = $input['action'] ?? ($_GET['action'] ?? 'get');

$pdo = getDbConnection();

$profileId = $input['profile_id'] ?? ($_GET['profile_id'] ?? '');
$syncToken = $input['sync_token'] ?? '';
$user = authenticateUser($pdo, $profileId, $syncToken);
if (!$user) {
    jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
}

// Find distinct years with bookings (top 3 most recent years)
$yearsStmt = $pdo->query("
    SELECT DISTINCT SUBSTR(date_start, 1, 4) AS yr FROM reservations WHERE status = 'booked' AND date_start IS NOT NULL AND date_start != ''
    UNION
    SELECT DISTINCT SUBSTR(date_end, 1, 4) AS yr FROM reservations WHERE status = 'booked' AND date_end IS NOT NULL AND date_end != ''
    ORDER BY yr DESC
");
$rawYears = $yearsStmt ? $yearsStmt->fetchAll(PDO::FETCH_COLUMN) : [];
$availableYears = [];
foreach ($rawYears as $y) {
    $yInt = (int) $y;
    if ($yInt > 2000 && $yInt < 2100 && !in_array($yInt, $availableYears, true)) {
        $availableYears[] = $yInt;
    }
}
$availableYears = array_slice($availableYears, 0, 3);
if (empty($availableYears)) {
    $availableYears = [(int) date('Y')];
}

$requestedYear = isset($input['year']) ? (int) $input['year'] : (isset($_GET['year']) ? (int) $_GET['year'] : null);
$year = ($requestedYear && in_array($requestedYear, $availableYears, true)) ? $requestedYear : $availableYears[0];

// Fetch all registered users
$userStmt = $pdo->query("SELECT id, profile_id, name, avatar FROM users ORDER BY id ASC");
$allUsers = $userStmt->fetchAll();

// Dynamic tally from booked reservations for the selected year
$tally = [];
foreach ($allUsers as $u) {
    $tally[$u['id']] = [
        'user_id' => (int) $u['id'],
        'profile_id' => $u['profile_id'],
        'name' => $u['name'],
        'avatar' => $u['avatar'],
        'weekend_days' => 0,
        'total_days' => 0
    ];
}

// Fetch all booked stays in the year
$resStmt = $pdo->prepare("
    SELECT user_id, date_start, date_end
    FROM reservations
    WHERE status = 'booked'
      AND (
          date_start LIKE ?
          OR date_end LIKE ?
      )
");
$yearPattern = "{$year}%";
$resStmt->execute([$yearPattern, $yearPattern]);
$bookings = $resStmt->fetchAll();

foreach ($bookings as $b) {
    $uid = $b['user_id'];
    if (!isset($tally[$uid])) continue;

    $start = new DateTime($b['date_start']);
    $end = new DateTime($b['date_end']);
    $interval = new DateInterval('P1D');
    $period = new DatePeriod($start, $interval, (clone $end)->modify('+1 day'));

    foreach ($period as $dt) {
        if ((int) $dt->format('Y') !== $year) continue; // clamp to year
        $tally[$uid]['total_days']++;
        $dayOfWeek = (int) $dt->format('N');
        if ($dayOfWeek === 6 || $dayOfWeek === 7) {
            $tally[$uid]['weekend_days']++;
        }
    }
}

// Convert to indexed array and sort by total days DESC, then weekend days DESC
$statsList = array_values($tally);
usort($statsList, function($a, $b) {
    if ($b['total_days'] !== $a['total_days']) {
        return $b['total_days'] - $a['total_days'];
    }
    return $b['weekend_days'] - $a['weekend_days'];
});

$maxTotalDays = 0;
foreach ($statsList as $item) {
    if ($item['total_days'] > $maxTotalDays) {
        $maxTotalDays = $item['total_days'];
    }
}

jsonResponse([
    'success' => true,
    'year' => $year,
    'available_years' => $availableYears,
    'max_days' => $maxTotalDays,
    'stats' => $statsList
]);
