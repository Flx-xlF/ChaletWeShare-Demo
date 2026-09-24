# 🏔️ ChaletWeShare (Demo)

> A lightweight Progressive Web App for shared vacation homes. Built to coordinate bookings, handovers, and chores without messy spreadsheets or family group chat drama.

[![Live Demo](https://img.shields.io/badge/Live_Demo-GitHub_Pages-F20587?style=flat-square&logo=github)](https://flx-xlf.github.io/ChaletWeShare-Demo/)
[![Bundle Size](https://img.shields.io/badge/Bundle-<95_kB_gzipped-black?style=flat-square)](https://flx-xlf.github.io/ChaletWeShare-Demo/)
[![LCP](https://img.shields.io/badge/LCP-152ms-2ea44f?style=flat-square)](https://flx-xlf.github.io/ChaletWeShare-Demo/)
[![WCAG](https://img.shields.io/badge/A11y-WCAG_2.1_AA-blue?style=flat-square)](https://flx-xlf.github.io/ChaletWeShare-Demo/)
[![License: MIT](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)](LICENSE)

---

## 🧭 Live Demo

You can try the interactive client-side demo directly in your browser:  
👉 **[https://flx-xlf.github.io/ChaletWeShare-Demo/](https://flx-xlf.github.io/ChaletWeShare-Demo/)**

* The demo runs entirely in the browser with pre-seeded demo profiles (*Elena*, *Lucas*, *Sophie*, *Nico*).
* You can book dates, test the 48-hour veto system, switch avatars, and inspect the co-ownership stats.
* No account or server setup needed.

---

## 📸 Screenshots

### Desktop Calendar
*Split check-in and check-out slots (14:00 / 11:00), stay status indicators, and avatar markers.*

![Desktop Calendar](docs/screenshots/calendar-desktop.png)

---

### Mobile PWA & Booking Sheet
*Designed for phone screens with native-like bottom sheets and quick date selection.*

| Mobile Calendar View | Booking & Detail Sheet |
| :---: | :---: |
| ![Mobile Calendar](docs/screenshots/calendar-mobile.png) | ![Booking Sheet](docs/screenshots/booking-modal.png) |

---

### Fair-Share Statistics & Notification Hub
*Booking balances across co-owners, handover reminders, and arrival briefings.*

| Usage & Night Balances | Notifications & Handover |
| :---: | :---: |
| ![Stats Dashboard](docs/screenshots/stats-dashboard.png) | ![Notification Sheet](docs/screenshots/notification-sheet.png) |

---

### Profile Picker & Avatars
*Device linking code and 13 Alpine-themed 32x32 SVG pixel avatars.*

<div align="center">
  <img src="docs/screenshots/profile-settings.png" alt="Profile Picker and Pixel Avatars" width="460" style="max-width: 100%; border: 2px solid #0D0D0D;" />
</div>

---

## 🛠️ How It Works

### 1. Vanilla JavaScript & Custom CSS
No React, no Vue, and no Tailwind. Just clean modern JavaScript (ES2022) and CSS custom properties.
* **Small footprint**: ~83 kB JS and ~9 kB CSS (gzipped).
* **Fast initial paint**: ~150ms LCP on standard devices.
* **Direct DOM updates**: Fast enough that virtual DOM overhead wasn't needed.

### 2. Bauhaus-Inspired Neo-Brutalist Design
A deliberate, high-contrast aesthetic:
* Crisp ink on off-white (`#0D0D0D` on `#FFFFFF`) with bold borders and hard offset shadows.
* 13 custom 32x32 SVG pixel-art avatars (Swan, Fox, Bear, Marmot, Steinbock, Pine, etc.).
* Zero border-radius throughout for a consistent, graphic look.

### 3. Veto Window & Fair-Share Rules
Co-owning a vacation home usually fails over scheduling conflicts:
* **Split-day stays**: Guest A can check out at 11:00 and Guest B can check in at 14:00 on the same date without overlap errors.
* **48-hour objection window**: Proposed dates are flagged as *pending*. If no co-owner files a veto within 48 hours, the stay is automatically confirmed.
* **Usage statistics**: Tracks nights stayed per person to keep distribution transparent.

### 4. Offline Support for Mountain Wi-Fi
Chalet Wi-Fi can be unpredictable:
* A service worker caches the core application shell on first load.
* If internet access drops during arrival, guests can still open the app to read handover notes, check-in instructions, and door codes.
* Installable as a standalone PWA on iOS and Android home screens.

### 5. Accessibility (WCAG 2.1 AA)
* Native semantic `<button>` elements with keyboard focus indicators (`:focus-visible`).
* ARIA dialog roles, live regions, and screen-reader headings.
* Contrast ratios verified against WCAG AA standards.

### 6. Dual Database Support
* **Demo / GitHub Pages**: Runs entirely in-browser using localStorage fallbacks.
* **Development**: Automatically uses SQLite (`api/chaletweshare.sqlite`) with auto-created tables.
* **Production**: Connects to MySQL/MariaDB with self-healing table verification on initial request.

---

## 💻 Running Locally

```bash
# Clone the repository
git clone https://github.com/Flx-xlF/ChaletWeShare-Demo.git
cd ChaletWeShare-Demo

# Install development dependencies
npm install

# Start local dev server
npm run dev

# Build production bundle
npm run build
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

*Built with care (and a bit of madness) by [schema/f](https://github.com/Flx-xlF)*
