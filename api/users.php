<?php
/**
 * ChaletWeShare — Users & Auth API
 */

require_once __DIR__ . '/db.php';

$input = getJsonInput();
$action = $input['action'] ?? ($_GET['action'] ?? '');

$pdo = getDbConnection();
$config = getConfig();

switch ($action) {
    case 'verify_gate':
        $submittedHash = $input['password_hash'] ?? '';
        $submittedPassword = $input['password'] ?? '';
        $expectedHash = $config['family_password_hash'] ?? '';
        
        // Anti-bruteforce delay
        usleep(150000);

        $valid = false;
        if (!empty($expectedHash)) {
            if (!empty($submittedHash) && hash_equals($expectedHash, $submittedHash)) {
                $valid = true;
            } elseif (!empty($submittedPassword) && (password_verify($submittedPassword, $expectedHash) || hash_equals($expectedHash, hash('sha256', $submittedPassword)))) {
                $valid = true;
            }
        }

        if ($valid) {
            jsonResponse([
                'success' => true,
                'message' => 'Tor geöffnet',
                'gate_token' => generateGateToken()
            ]);
        } else {
            jsonResponse(['success' => false, 'error' => 'Falsches Passwort'], 401);
        }
        break;

    case 'list':
        requireGateOrUser($pdo, $input);
        $stmt = $pdo->query("SELECT id, profile_id, name, avatar, email, created_at FROM users ORDER BY id ASC");
        $users = $stmt->fetchAll();
        jsonResponse([
            'success' => true,
            'users' => $users,
            'count' => count($users),
            'max_allowed' => 12
        ]);
        break;

    case 'register':
        requireGateOrUser($pdo, $input);
        // Check current count
        $countStmt = $pdo->query("SELECT COUNT(*) as total FROM users");
        $count = (int) $countStmt->fetch()['total'];
        if ($count >= 12) {
            jsonResponse([
                'success' => false,
                'error' => 'Maximale Anzahl von 12 Profilen ist erreicht.'
            ], 400);
        }

        $name = trim(strip_tags($input['name'] ?? ''));
        $avatar = trim(strip_tags($input['avatar'] ?? 'swan'));
        $email = trim(strip_tags($input['email'] ?? ''));

        if (empty($name)) {
            jsonResponse(['success' => false, 'error' => 'Name ist erforderlich.'], 400);
        }
        if (mb_strlen($name) > 30) {
            jsonResponse(['success' => false, 'error' => 'Name darf maximal 30 Zeichen lang sein.'], 400);
        }
        if (mb_strlen($avatar) > 30) {
            $avatar = 'swan';
        }

        // Check for duplicate profile name (case-insensitive)
        $dupStmt = $pdo->prepare("SELECT id FROM users WHERE LOWER(name) = LOWER(?)");
        $dupStmt->execute([$name]);
        if ($dupStmt->fetch()) {
            jsonResponse([
                'success' => false,
                'error' => 'Ein Profil mit diesem Namen existiert bereits. Bitte wähle einen anderen Namen oder verknüpfe dein bestehendes Profil mit dem Koppel-Code.'
            ], 400);
        }

        // Generate profile_id and sync_token
        $profileId = substr(bin2hex(random_bytes(4)), 0, 8);
        $syncToken = bin2hex(random_bytes(16));

        $stmt = $pdo->prepare("
            INSERT INTO users (profile_id, name, avatar, sync_token, email, created_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ");
        $stmt->execute([$profileId, $name, $avatar, $syncToken, $email ?: null]);

        $userId = $pdo->lastInsertId();

        jsonResponse([
            'success' => true,
            'user' => [
                'id' => (int) $userId,
                'profile_id' => $profileId,
                'name' => $name,
                'avatar' => $avatar,
                'sync_token' => $syncToken,
                'email' => $email
            ]
        ], 201);
        break;

    case 'link_device':
        requireGateOrUser($pdo, $input);
        $profileId = trim($input['profile_id'] ?? ($_GET['profile_id'] ?? ''));
        $syncCode = trim($input['sync_code'] ?? ($_GET['sync_code'] ?? ''));

        if (empty($profileId) || empty($syncCode)) {
            jsonResponse(['success' => false, 'error' => 'Profil-ID und Koppel-Code sind erforderlich.'], 400);
        }

        // Anti-bruteforce delay
        usleep(150000);

        $stmt = $pdo->prepare("SELECT id, profile_id, name, avatar, email, sync_token FROM users WHERE profile_id = ?");
        $stmt->execute([$profileId]);
        $user = $stmt->fetch();

        if (!$user) {
            usleep(350000);
            jsonResponse(['success' => false, 'error' => 'Profil nicht gefunden.'], 404);
        }

        // The 6-character sync code matches the first 6 characters of sync_token (case-insensitive)
        $expectedCode = substr($user['sync_token'], 0, 6);
        if (strcasecmp($expectedCode, $syncCode) !== 0) {
            usleep(350000); // 150ms + 350ms = 500ms total penalty on wrong code
            jsonResponse([
                'success' => false,
                'error' => 'Ungültiger Koppel-Code. Bitte prüfe den Code in den Profileinstellungen auf deinem anderen Gerät.'
            ], 403);
        }

        // Successfully verified: return user with full sync_token
        jsonResponse([
            'success' => true,
            'message' => 'Gerät erfolgreich gekoppelt!',
            'user' => [
                'id' => (int) $user['id'],
                'profile_id' => $user['profile_id'],
                'name' => $user['name'],
                'avatar' => $user['avatar'],
                'email' => $user['email'],
                'sync_token' => $user['sync_token']
            ]
        ]);
        break;

    case 'reset_token':
        $profileId = trim($input['profile_id'] ?? '');
        $syncToken = trim($input['sync_token'] ?? '');
        $newSyncToken = trim($input['new_token'] ?? '');
        $gateToken = getProvidedGateToken($input);

        if (!$profileId) {
            jsonResponse(['success' => false, 'error' => 'Profil-ID fehlt.'], 400);
        }

        $user = null;
        if (!empty($syncToken)) {
            $checkStmt = $pdo->prepare("SELECT id, name, avatar, email FROM users WHERE profile_id = ? AND sync_token = ?");
            $checkStmt->execute([$profileId, $syncToken]);
            $user = $checkStmt->fetch();
        }

        // If syncToken did not match or was not provided, allow if Family Gate token is valid
        if (!$user && verifyGateToken($gateToken)) {
            $checkStmt = $pdo->prepare("SELECT id, name, avatar, email FROM users WHERE profile_id = ?");
            $checkStmt->execute([$profileId]);
            $user = $checkStmt->fetch();
        }

        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 403);
        }

        // Use provided newSyncToken (if valid 32-char hex) or generate a fresh one
        if (empty($newSyncToken) || strlen($newSyncToken) < 16) {
            $newSyncToken = bin2hex(random_bytes(16));
        }

        $updateStmt = $pdo->prepare("UPDATE users SET sync_token = ? WHERE id = ?");
        $updateStmt->execute([$newSyncToken, $user['id']]);

        jsonResponse([
            'success' => true,
            'message' => 'Neuer Koppel-Code wurde generiert. Andere Geräte wurden abgemeldet.',
            'sync_token' => $newSyncToken,
            'sync_code' => strtoupper(substr($newSyncToken, 0, 6)),
            'user' => [
                'id' => (int) $user['id'],
                'profile_id' => $profileId,
                'name' => $user['name'],
                'avatar' => $user['avatar'],
                'email' => $user['email'],
                'sync_token' => $newSyncToken
            ]
        ]);
        break;

    case 'update':
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';
        $name = trim(strip_tags($input['name'] ?? ''));
        $avatar = trim(strip_tags($input['avatar'] ?? ''));
        $email = trim(strip_tags($input['email'] ?? ''));

        if (!$profileId || !$syncToken) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        // Verify token
        $checkStmt = $pdo->prepare("SELECT id FROM users WHERE profile_id = ? AND sync_token = ?");
        $checkStmt->execute([$profileId, $syncToken]);
        $user = $checkStmt->fetch();

        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Ungültige Benutzer-Berechtigung.'], 403);
        }

        $updates = [];
        $params = [];
        if (!empty($name)) {
            if (mb_strlen($name) > 30) {
                jsonResponse(['success' => false, 'error' => 'Name darf maximal 30 Zeichen lang sein.'], 400);
            }
            $dupStmt = $pdo->prepare("SELECT id FROM users WHERE LOWER(name) = LOWER(?) AND id != ?");
            $dupStmt->execute([$name, $user['id']]);
            if ($dupStmt->fetch()) {
                jsonResponse(['success' => false, 'error' => 'Ein Profil mit diesem Namen existiert bereits.'], 400);
            }
            $updates[] = "name = ?";
            $params[] = $name;
        }
        if (!empty($avatar)) {
            $updates[] = "avatar = ?";
            $params[] = $avatar;
        }
        if ($email !== '') {
            $updates[] = "email = ?";
            $params[] = $email ?: null;
        }

        if (empty($updates)) {
            jsonResponse(['success' => true, 'message' => 'Keine Änderungen.']);
        }

        $params[] = $user['id'];
        $sql = "UPDATE users SET " . implode(', ', $updates) . " WHERE id = ?";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        jsonResponse(['success' => true, 'message' => 'Profil aktualisiert.']);
        break;

    case 'delete':
        $profileId = $input['profile_id'] ?? '';
        $syncToken = $input['sync_token'] ?? '';

        if (!$profileId || !$syncToken) {
            jsonResponse(['success' => false, 'error' => 'Nicht autorisiert.'], 401);
        }

        $checkStmt = $pdo->prepare("SELECT id FROM users WHERE profile_id = ? AND sync_token = ?");
        $checkStmt->execute([$profileId, $syncToken]);
        $user = $checkStmt->fetch();

        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Ungültige Benutzer-Berechtigung.'], 403);
        }

        $delStmt = $pdo->prepare("DELETE FROM users WHERE id = ?");
        $delStmt->execute([$user['id']]);

        jsonResponse(['success' => true, 'message' => 'Profil gelöscht.']);
        break;

    default:
        jsonResponse(['success' => false, 'error' => 'Unbekannte Aktion.'], 400);
        break;
}
