# 🏔️ ChaletWeShare (Demo)

> Lightweight vacation home co-ownership PWA built with Vanilla JS, Neo-Brutalist + Liquid Glass UI, a 4-tier Zurich-time veto engine, conflict resolution (shared stays & dice rolls), contextual micro-chat, Doodle-style workday voting, and an optional PHP 8.1+ backend.

[![Live Demo](https://img.shields.io/badge/Live_Demo-GitHub_Pages-F20587?style=flat-square&logo=github)](https://flx-xlf.github.io/ChaletWeShare-Demo/)
[![Bundle Size](https://img.shields.io/badge/Gzipped-~100_kB_total-black?style=flat-square)](https://flx-xlf.github.io/ChaletWeShare-Demo/)
[![PWA](https://img.shields.io/badge/PWA-Installable-blue?style=flat-square)](https://flx-xlf.github.io/ChaletWeShare-Demo/)
[![Backend](https://img.shields.io/badge/API-PHP_8.1%2B_%7C_MySQL_%2F_SQLite-777BB4?style=flat-square)](api/schema.sql)
[![UI Language](https://img.shields.io/badge/UI-de--CH_(Swiss_German)-10b981?style=flat-square)](index.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)](LICENSE)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Tip_Me-FF5E5B?style=flat-square&logo=kofi)](https://ko-fi.com/flxxlf)

---

## 🧭 Live Demo & Architecture Scope

Explore the hosted frontend build directly in your browser:  
👉 **[https://flx-xlf.github.io/ChaletWeShare-Demo/](https://flx-xlf.github.io/ChaletWeShare-Demo/)**

The app UI is written in **Swiss-German (`de-CH`)** and themed around a fictional shared chalet (*Chalet Alpenrose*, Thunersee / Berner Oberland). Because GitHub Pages serves static files without PHP, it is helpful to distinguish what runs purely client-side vs. what requires the included `/api` backend:

* **Pre-seeded Demo Data (`localStorage`):**
  * 🦢 **Elena** (default active profile, `swan` avatar): confirmed stay (18th–21st of the current month), 1 handover note (`Kehricht`), and 2 maintenance blocks (10th full-day chimney/heating check, 21st afternoon end-of-stay cleaning).
  * 🦊 **Lucas** (`fox` avatar): pending booking request (25th–28th) with a 10-hour demo veto countdown.
  * 🐻 **Sophie** (`bear` avatar) & 🐐 **Nico** (`ibex` avatar): additional co-owner profiles available for instant switching.
* **Works Offline / on GitHub Pages (`localStorage` fallbacks):**
  * Browsing the continuous calendar feed (January of the current year through October 31 of the following year), inspecting day details and diagonal changeover splits, testing date-range selection and night steppers, switching between the 4 seeded demo profiles, creating/editing/deleting/acknowledging handover notes, viewing arrival briefings and departure handover prompts, managing the in-app notification drawer (`Neu` / `Bisherige`, mark read, clear read), exporting `.ics` calendar files, and running the interactive Legend & 3-step QuickTour.
* **Requires the Self-Hosted PHP 8.1+ Backend (`api/*.php`):**
  * Creating or cancelling bookings, casting/withdrawing vetoes, approving pending requests, resolving conflicts (shared stays or RNG dice rolls), sending micro-chat messages, saving maintenance blocks, creating/voting/finalizing/RSVPing working days, creating/linking/deleting profiles, real multi-year statistics aggregation, Web Push delivery, background cron jobs, and Discord bug reporting. *(On static hosting without PHP, write actions that depend on `/api/*.php` display a server/network error or roll back optimistic updates.)*

---

## ✨ Current Capabilities

### 1. 📅 Split-Slot Calendar & Collision-Aware Booking Engine
* **Same-Day Turnover (`Wechseltag`):** Check-in starts at `14:00` and check-out ends at `11:00`, rendered with 45° diagonal split cells so back-to-back stays share boundary dates without wasting nights.
* **Continuous Feed & Dual Input:** Scrolls continuously through October 31 of next year with an `↑ HEUTE` floating action button, touch pull-to-refresh, desktop mouse drag-to-select, mobile 2-tap range picking, and `±1 Tag` night steppers inside the booking sheet (up to 28 nights in the stepper; 31 days max on the server).
* **Collision & Shared-Stay Detection:** Real-time overlap inspection distinguishes unresolved double bookings (`⚠️ 2x` hot-pink & canary-yellow hazard stripes) from mutually agreed shared stays (`🤝` *Doppelnutzung*) and transaction-locked server validation (`api/reservations.php`).

### 2. ⚖️ 4-Tier Zurich-Time Veto Engine & Conflict Resolution
Instead of a single fixed timer, veto deadlines adapt dynamically to how far in advance a stay is requested (`Europe/Zurich`):
* **< 24h before check-in (`14:00`):** Instant confirmation (`booked` immediately, no veto window).
* **24h – 48h before check-in:** Shortened **4-hour** veto deadline.
* **2 – 30 days before check-in:** Standard **20:15 Zurich cutoff** (same day at `20:15` if requested before `08:00`, next day at `20:15` otherwise).
* **≥ 30 days before check-in:** Extended **3-day** veto window expiring at `20:15`.
* **Early Consensus:** Pending requests promote to `booked` immediately once all other registered co-owners approve.
* **Requester-Authority Resolution (`conflictModal.js`):** When a co-owner casts a veto, the vetoer can propose solutions (`propose_resolution`), discuss in chat, or withdraw the veto; the original requester holds final authority to confirm **Doppelnutzung** (shared stay), trigger an animated **Losentscheid (RNG)** 6-sided pixel dice roll with haptic vibration, or withdraw the booking.

### 3. 💬 Contextual Micro-Chat & Smart Communication Hub
* **Scoped Threads (`api/chat.php`):** Dedicated micro-chat drawers attached directly to disputed reservations and maintenance blocks, complete with inline quick-action bars (propose/trigger shared stay or dice roll, withdraw, or allow maintenance overlap).
* **Dynamic Header Hub (`ChatHubBadge`):** Displays a red lightning badge (`⚡`) when active conflicts require resolution, switches to a blue chat badge (`💬`) for open discussions, and hides automatically when clear.
* **Anti-Spam & Lifecycle:** Uses visibility-aware polling (15s active / 60s idle), 5-minute Web Push cooldown throttling (`push_throttle`), and per-user or owner-wide chat dismissal (`chat_dismissals`).

### 4. 🛠️ Maintenance Slots & Doodle-Style Working Days
* **Maintenance Blocks (`maintenanceSheet.js`):** Schedule, edit, and remove maintenance or cleaning entries (`full`, `morning`, or `afternoon` slots) directly from the calendar, with per-user overlap approval (`allow_maintenance_overlap`) so co-owners can still book during maintenance if permitted.
* **Seasonal Working Days (`workingDaySheet.js` & `api/working_days.php`):** Organize *Frühjahrsputz* (Spring) and *Einwintern* (Autumn) events either as a fixed date or a **Doodle-style 3-date vote** (`Dabei` / `Eventuell` / `Keine Zeit`) with creator finalization, RSVP roster progress bars, and collision warnings.

### 5. 📋 Digital Handover Notes, Read Receipts & `.ics` Export
* **Categorized Handovers (`handoverService.js` & `api/handover.php`):** Leave notes tagged as `Kehricht` (garbage), `Fehlendes` (missing items), `Defekt` (defects), or `Notiz` (custom), automatically routed to the next scheduled stay with full edit/delete support for authors.
* **Two-Way Read Receipts:** Incoming guests confirm reading handover notes with one tap (`Gelesen bestätigen`), recording reader name and timestamp.
* **Arrival & Departure Cards:** Displays an arrival briefing card (`48h` before check-in through `24h` after) with countdown and prior guest notes, plus an end-of-stay handover prompt before checkout.
* **iCalendar Export (`icsUtils.js`):** One-click RFC 5545 `.ics` file download for confirmed stays (`14:00`–`11:00`) and finalized working days.

### 6. 📊 Fair-Share Annual Stats, Notifications & Self-Hosted Ops
* **Multi-Year Usage Stats (`stats.js` & `api/stats.php`):** Tracks total booked days and weekend days (Sat/Sun) per co-owner across up to the 3 most recent active booking years, resetting every January 1.
* **Actionable Notification Center (`notificationBadge.js`):** Unread/read tabs with deep-linking straight to the relevant date, reservation, conflict, working day, maintenance item, handover note, or micro-chat, paired with the App Badging API (`setAppBadge`/`clearAppBadge`) and optional Web Push (`minishlink/web-push` ^9.0 + native VAPID fallback).
* **Automated Cron (`api/cron.php`):** Promotes pending stays past their veto deadline, purges notifications older than 14 days, and dispatches arrival, handover, and working-day voting/RSVP/eve reminders.
* **Discord Bug Reporting (`reportModal.js` & `api/report.php`):** Built-in categorized issue/feedback sheet (also surfaced on technical error toasts/banners) with IP rate limiting (5 reports per 10 minutes).

### 7. 🎨 Neo-Brutalist Design, Pixel Art & Offline-First PWA
* **Visual System:** Sharp zero-radius cards, grid cells, and bottom sheets (`#F2F2F2` surface, `#1C1C1E` ink/borders, `#F20587` hot pink, `#FFD600` yellow, `#3D4350` slate, hard offset shadows) combined with floating Liquid Glass header and bottom navigation pills (`backdrop-filter: blur(30px)`).
* **Custom Pixel Suite & Animations:** 13 custom 32×32 SVG Alpine avatars (`Swan`, `Fox`, `Bear`, `Marmot`, `Owl`, `Ibex`, `Pine`, `Cowbell`, `Cheese`, `Edelweiss`, `Mug`, `Fire`, `Lantern`), crisp pixel icons, and 5 skippable Anime.js overlays (Swan parade, Rocket launch, Bauhaus confetti, Thunderstorm, Sun & Bird).
* **PWA & Auto-Updates:** Installable Web App Manifest + `sw.js` network-first caching with offline shell fallback + `version.json` deployment polling to auto-refresh stale clients.
* **Accessibility Foundations:** Screen-reader heading (`sr-only`), `role="gridcell"`, `role="dialog"`, `aria-modal`, `role="progressbar"`, and descriptive `aria-label` attributes across interactive controls.

---

## 🛠️ Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| **Frontend** | Vanilla ES Modules (ES2020/ES2022) | Zero framework overhead; direct DOM rendering (`~89.5 kB` JS gzipped) |
| **Styling** | Vanilla CSS (`src/index.css`) | Custom Neo-Brutalist tokens + Liquid Glass floating nav (`~9.8 kB` CSS gzipped) |
| **Animations** | [Anime.js](https://animejs.com/) (`^3.2.2`) | Dice roll physics, celebration overlays, and auth-gate feedback |
| **PWA & Offline** | Service Worker (`public/sw.js`) & Manifest | Network-first static caching, App Badging, and Web Push click deep-linking |
| **Build Tool** | [Vite](https://vitejs.dev/) (`^6.2.0`) | Injects `version.json`, proxies `/api`, and builds sanitized `dist/api/` |
| **Backend (Optional)** | PHP 8.1+ (PDO) | 16-table schema (`api/schema.sql`) with MySQL/MariaDB & automatic SQLite fallback |
| **Web Push** | [`minishlink/web-push`](https://github.com/web-push-libs/web-push-php) (`^9.0`) | VAPID push delivery with pure-PHP OpenSSL/cURL fallback |
| **Demo Hosting** | [GitHub Pages](https://pages.github.com/) | Automated build & deployment via `.github/workflows/deploy-pages.yml` |

---

## 🚀 Local Development & Self-Hosting

### Frontend Only (Static Demo Mode)

```bash
# 1. Clone the repository
git clone https://github.com/Flx-xlF/ChaletWeShare-Demo.git
cd ChaletWeShare-Demo

# 2. Install dependencies
npm install

# 3. Start Vite dev server (http://127.0.0.1:5173)
npm run dev

# 4. Build production bundle to dist/ (~100 kB gzipped total)
npm run build
```

### Full-Stack Mode (With PHP 8.1+ Backend)

1. **Install PHP dependencies** (for full payload-encrypted Web Push via `minishlink/web-push`):
   ```bash
   cd api && composer install && cd ..
   ```
2. **Configure credentials:** Copy `api/config.example.php` to `api/config.php` and set your `db_*` credentials, `family_password_hash` (SHA-256), `vapid_*` keys, `cron_key`, `discord_webhook_url` (optional), and `allowed_origins`.
   * *Note:* If MySQL/MariaDB is unavailable, `api/db.php` automatically creates and migrates a local SQLite database at `api/chaletweshare.sqlite`.
   * *Demo vs. Production Gate:* `isGateUnlocked()` in `src/engine/profileManager.js` returns `true` for the public demo showcase; restore gate checks there if deploying privately behind the family password gate (`api/users.php?action=verify_gate`).
3. **Run backend + Vite proxy locally:** `vite.config.js` proxies `/api/*` to `http://localhost:8000`:
   ```bash
   php -S localhost:8000 &
   npm run dev
   ```
4. **Build & deploy:** `npm run build` copies a sanitized `api/` directory into `dist/api/` (stripping `config.php`, `config.example.php`, `*.sqlite*`, `schema.sql`, and `composer.*`). Keep your server's `api/config.php` out of the overwritten artifacts, and schedule `api/cron.php` (passing `?key=<cron_key>` or `X-Cron-Key`) if using automated reminders and deadline promotions.

---

## 📄 License & Attribution

Distributed under the **MIT License** — see [LICENSE](LICENSE).

Built with care (and a bit of madness) by [schema/f](https://github.com/Flx-xlF).  
Enjoy my work? [Tip me on Ko-fi](https://ko-fi.com/flxxlf).
