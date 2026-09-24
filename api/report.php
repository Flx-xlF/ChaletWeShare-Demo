<?php
/**
 * ChaletWeShare — Issue & Feedback Reporting Endpoint
 * Receives user reports from ChaletWeShare and dispatches them via Discord Webhook.
 */

require_once __DIR__ . '/db.php';

header('Content-Type: application/json; charset=UTF-8');

// Allow CORS / preflight requests if needed
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
    exit;
}

// Read and decode JSON payload
$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

if (!$data || !is_array($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON payload']);
    exit;
}

// Anti-spam / rate-limiting per IP (max 5 reports per 10 minutes)
$clientIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$rateFile = sys_get_temp_dir() . '/cws_report_' . md5($clientIp) . '.json';
$nowTs = time();
$history = [];
if (file_exists($rateFile)) {
    $rawHistory = @file_get_contents($rateFile);
    $history = is_string($rawHistory) ? (json_decode($rawHistory, true) ?: []) : [];
    // Keep only timestamps from the last 600 seconds (10 minutes)
    $history = array_filter($history, function($t) use ($nowTs) { return ($nowTs - $t) < 600; });
}
if (count($history) >= 5) {
    http_response_code(429);
    echo json_encode(['success' => false, 'error' => 'Zu viele Meldungen gesendet. Bitte warte einige Minuten.']);
    exit;
}
$history[] = $nowTs;
@file_put_contents($rateFile, json_encode(array_values($history)));

// Extract and sanitize fields with strict length bounds
$userName    = mb_substr(trim((string)($data['userName'] ?? 'Unbekannt')), 0, 50);
$profileId   = mb_substr(trim((string)($data['profileId'] ?? '—')), 0, 30);
$category    = mb_substr(trim((string)($data['category'] ?? 'Problem')), 0, 50);
$message     = mb_substr(trim((string)($data['message'] ?? '')), 0, 2000);
$userAgent   = trim((string)($data['userAgent'] ?? ($_SERVER['HTTP_USER_AGENT'] ?? 'Unbekannt')));
$windowSize  = mb_substr(trim((string)($data['windowSize'] ?? 'Unbekannt')), 0, 30);
$appVersion  = mb_substr(trim((string)($data['appVersion'] ?? '1.0.0')), 0, 20);
$currentRoute= mb_substr(trim((string)($data['currentRoute'] ?? '—')), 0, 100);
$timestamp   = date('Y-m-d H:i:s');

if (empty($message)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Nachricht darf nicht leer sein.']);
    exit;
}

// Discord Webhook URL provided for ChaletWeShare (configured in api/config.php)
$config = getConfig();
$webhookUrl = trim((string)($config['discord_webhook_url'] ?? ''));

if (empty($webhookUrl)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Discord Webhook ist auf diesem Server nicht konfiguriert.']);
    exit;
}

// Theme color based on category
$embedColor = 0xF20587; // ChaletWeShare Hot Pink default
if (stripos($category, 'Buchung') !== false) {
    $embedColor = 0xEF4444; // Red
} elseif (stripos($category, 'Kalender') !== false) {
    $embedColor = 0xF59E0B; // Amber
} elseif (stripos($category, 'Push') !== false) {
    $embedColor = 0x8B5CF6; // Purple
} elseif (stripos($category, 'Profil') !== false || stripos($category, 'Kopplung') !== false) {
    $embedColor = 0x3B82F6; // Blue
} elseif (stripos($category, 'Idee') !== false || stripos($category, 'Vorschlag') !== false) {
    $embedColor = 0x10B981; // Green
}

$deviceSummary = mb_strlen($userAgent) > 200 ? mb_substr($userAgent, 0, 197) . '...' : $userAgent;
if ($windowSize !== 'Unbekannt') {
    $deviceSummary .= " ({$windowSize})";
}

$discordPayload = [
    'username'   => 'Chalet Zahler 🏔️ Melder',
    'avatar_url' => 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f3d4.png',
    'embeds'     => [
        [
            'title'       => "🚩 ChaletWeShare: {$category}",
            'color'       => $embedColor,
            'description' => $message !== '' ? "**Beschreibung:**\n{$message}" : "*Kein zusätzlicher Text eingegeben.*",
            'fields'      => [
                [
                    'name'   => '👤 Nutzer / Profil',
                    'value'  => "{$userName} (`{$profileId}`)",
                    'inline' => true,
                ],
                [
                    'name'   => '🏷️ App-Version',
                    'value'  => $appVersion !== '' ? $appVersion : 'Dev',
                    'inline' => true,
                ],
                [
                    'name'   => '🧭 Ansicht',
                    'value'  => $currentRoute !== '' ? "`{$currentRoute}`" : '—',
                    'inline' => true,
                ],
                [
                    'name'   => '📱 Gerät & Browser',
                    'value'  => $deviceSummary,
                    'inline' => false,
                ],
            ],
            'footer'      => [
                'text' => "Chalet Zahler • Hilterfingen–Oberhofen • {$timestamp}",
            ],
        ],
    ],
];

$jsonPayload = json_encode($discordPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

// Send via cURL or stream context
$sent = false;
$httpCode = 0;

if (function_exists('curl_init')) {
    $ch = curl_init($webhookUrl);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonPayload);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Content-Length: ' . strlen($jsonPayload),
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    $response = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    unset($ch);
    $sent = ($httpCode >= 200 && $httpCode < 300);
} else {
    $options = [
        'http' => [
            'header'  => "Content-Type: application/json\r\n",
            'method'  => 'POST',
            'content' => $jsonPayload,
            'timeout' => 10,
            'ignore_errors' => true,
        ],
    ];
    $context = stream_context_create($options);
    $response = @file_get_contents($webhookUrl, false, $context);
    $headers = function_exists('http_get_last_response_headers') ? http_get_last_response_headers() : ($http_response_header ?? []);
    if (!empty($headers) && is_array($headers)) {
        if (preg_match('#HTTP/\S+\s+(\d{3})#i', $headers[0], $matches)) {
            $httpCode = (int)$matches[1];
            $sent = ($httpCode >= 200 && $httpCode < 300);
        }
    }
}

if ($sent) {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'Meldung erfolgreich an Discord übermittelt']);
} else {
    http_response_code(502);
    echo json_encode([
        'success'  => false,
        'error'    => 'Fehler beim Senden an Discord',
        'httpCode' => $httpCode,
    ]);
}
