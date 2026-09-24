<?php
/**
 * ChaletWeShare — Configuration
 * Copy this file to config.php and update with your actual credentials.
 */

return [
    'db_host' => 'localhost',
    'db_name' => 'chaletweshare_db',
    'db_user' => 'chalet_user',
    'db_pass' => 'your_secret_db_password',
    'db_charset' => 'utf8mb4',

    // Family master access gate password hash (SHA-256)
    // Default below is hash of: "thunersee2026"
    'family_password_hash' => '51798aeef86970bc8e2d7f04683a6d58292813d9dbb7484469720d17ab3d945c',

    // VAPID keys for Web Push notifications (minishlink/web-push)
    'vapid_subject' => 'mailto:admin@schoolyard.ch',
    'vapid_public_key' => '',
    'vapid_private_key' => '',

    // Secret key for background cron execution (api/cron.php)
    'cron_key' => 'change_this_to_a_random_secret_token_in_production',

    // Optional Discord webhook URL for bug & feedback reporting (api/report.php)
    'discord_webhook_url' => '',

    // Allowed origins for CORS (leave empty array to allow same-origin only, or specify trusted domains)
    'allowed_origins' => [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'https://chaletweshare.schoolyard.ch',
    ],
];

