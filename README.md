# 🏔️ ChaletWeShare (Demo)

> Lightweight, privacy-first vacation home co-ownership platform. Built with a conflict-free reservation engine, split check-in/out slots, a 48-hour veto window, fair-share usage analytics, and offline-first mountain reliability.

[![Live Demo](https://img.shields.io/badge/Live_Demo-GitHub_Pages-F20587?style=flat-square&logo=github)](https://flx-xlf.github.io/ChaletWeShare-Demo/)
[![Bundle Size](https://img.shields.io/badge/Bundle-<95_kB_gzipped-black?style=flat-square)](https://flx-xlf.github.io/ChaletWeShare-Demo/)
[![PWA](https://img.shields.io/badge/PWA-Installable-blue?style=flat-square)](https://flx-xlf.github.io/ChaletWeShare-Demo/)
[![A11y](https://img.shields.io/badge/A11y-WCAG_2.1_AA-10b981?style=flat-square)](https://flx-xlf.github.io/ChaletWeShare-Demo/)
[![License: MIT](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)](LICENSE)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Tip_Me-FF5E5B?style=flat-square&logo=kofi)](https://ko-fi.com/flxxlf)

---

## 🧭 Live Demo

Explore the fully interactive, client-side demo directly in your browser:  
👉 **[https://flx-xlf.github.io/ChaletWeShare-Demo/](https://flx-xlf.github.io/ChaletWeShare-Demo/)**

* **Pre-seeded Demo Profiles:**
  * 🦢 **Elena:** Swan avatar (`demo_token_1`), active confirmed weekend stay (18th–21st), and scheduled maintenance (deep cleaning & chimney sweep).
  * 🦊 **Lucas:** Fox avatar (`demo_token_2`), active pending booking request (25th–28th) with a running 48-hour veto window.
  * 🐻 **Sophie:** Bear avatar (`demo_token_3`), flexible stays, handover briefings, and incident logs.
  * 🐐 **Nico:** Ibex avatar (`demo_token_4`), weekend trips and co-ownership usage analytics.
  * ➕ **Your Own Profile:** Switch between profiles instantaneously, test device linking codes, or reset demo data anytime.
* **100% Client-Side:** Runs completely in your browser with `localStorage` persistence and service worker caching. No server setup, no mandatory registration, and no tracking.

---

## ✨ Key Features

### 1. 📅 Conflict-Free Reservation Engine & Split Slots
* **Same-Day Turnover:** Supports split check-in (14:00) and check-out (11:00) slots so co-owners can transition on the same day without blocking artificial buffer days.
* **Double-Booking & Collision Awareness:** Real-time overlap collision detection with high-contrast amber/black hazard stripes, collision banners, and side-by-side conflict resolution sheets.
* **Interactive Maintenance & Workdays:** Schedule and edit deep cleaning, chimney sweeps, or renovation days with morning, afternoon, or full-day allocations directly from the calendar.

### 2. ⚖️ Democratic 48-Hour Veto Window & Fair-Share Rules
* **Objection Period:** Proposed stays are placed in a 48-hour *pending* state, giving all co-owners fair notice to approve or file a veto before auto-confirmation.
* **Fair-Share Statistics Dashboard:** Transparently tracks nights stayed per co-owner and season distribution to eliminate vacation home scheduling drama.
* **Early Consensus:** Bookings are automatically confirmed as soon as all other co-owners cast their approval.

### 3. 🏔️ Mountain-Proof Offline Reliability (PWA)
* **Offline Access to Critical Data:** Handover notes, arrival briefings, key lockbox codes, and heating instructions remain accessible even when alpine cellular networks drop.
* **Service Worker Caching:** Instantly loads the application shell and offline-first data layer on low-bandwidth mountain connections.
* **Installable App:** Native-like standalone installation for iOS and Android home screens with customized alpine icons.

### 4. 📝 Digital Handover Hub & Read Acknowledgment
* **Arrival & Departure Briefings:** Track firewood levels, waste disposal schedules, key lockbox codes, and house guidelines.
* **Two-Way Read Receipts:** Subsequent guests can acknowledge handover notes with a single tap (`[✓ Gelesen bestätigen]`), updating status in real-time.
* **Actionable Notification Center:** Real-time in-app badge hub for incoming booking alerts, pending veto deadlines, and handover notices with calendar deep-linking.
* **Contextual Incident Logging:** Report broken equipment or necessary repairs directly linked to stays for effortless co-owner coordination.

### 5. 🎨 Neo-Brutalist Aesthetic & Alpine Pixel Avatars
* **High-Contrast Neo-Brutalism:** Crisp black ink (`#0D0D0D`) on pure white (`#FFFFFF`) with bold borders, hard offset shadows, and zero border-radius for glare-resistant outdoor readability.
* **13 Custom SVG Pixel Avatars:** Hand-crafted Alpine wildlife icons (Swan, Fox, Bear, Ibex, Marmot, Pine, Owl, and more).
* **Accessibility First (WCAG 2.1 AA):** Strict semantic HTML5 elements, full keyboard focus states (`:focus-visible`), and ARIA dialog modal semantics.

### 6. 🔄 Dual Architecture: Client-Side Demo or Self-Hosted Sync
* **Zero-Setup Demo Mode:** Fully functional in-browser experience powered by `localStorage` without requiring any backend.
* **Optional Full-Stack Sync:** Ready for deployment with a lightweight PHP 8.x backend supporting SQLite/MySQL and Web Push notifications.

---

## 🛠️ Technology Stack

| Component | Technology | Rationale |
|---|---|---|
| **Core Architecture** | Vanilla ES Modules (ES2022) | Zero framework overhead, instantaneous boot time, and direct DOM manipulation |
| **Styling & Design System** | Modern Vanilla CSS | Neo-Brutalist high-contrast tokens, hard drop shadows, and zero border-radius |
| **Micro-Animations** | [Anime.js](https://animejs.com/) | Smooth bottom-sheet transitions, celebration effects, and micro-interactions |
| **PWA & Offline Cache** | Service Worker & Web App Manifest | Mountain-proof offline cache for door codes, handover notes, and bookings |
| **Bundler & Build Tool** | [Vite](https://vitejs.dev/) | Lightning-fast HMR and ultra-compact production bundle (<95 kB gzipped) |
| **Hosting** | [GitHub Pages](https://pages.github.com/) | 1-click CI/CD deployment via GitHub Actions with zero server maintenance |

---

## 🚀 Local Development

```bash
# 1. Clone the repository
git clone https://github.com/Flx-xlF/ChaletWeShare-Demo.git
cd ChaletWeShare-Demo

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev

# 4. Create production build
npm run build
```

---

## 📄 License & Attribution

Distributed under the **MIT License**.

Built with care (and a bit of madness) by [schema/f](https://github.com/Flx-xlF).  
Enjoy my work? [Tip me on Ko-fi](https://ko-fi.com/flxxlf).
