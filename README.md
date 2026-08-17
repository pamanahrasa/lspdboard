# LSPD Notice Board

An operational Command Center for tracking Sick Leave, Leave of Absence, and
Vacation / Annual Leave across the Los Santos Police Department. Built for
a GTA V FiveM Roleplay server.

Static frontend (HTML/CSS/JS, deploys to GitHub Pages, no build step) backed
by **Firebase** (Firestore + Authentication) so every change an admin makes
is visible **in real time** to anyone viewing the Public Dashboard, on any
device, anywhere.

Designed & developed by **PamanahRasa** — Lieutenant OSS, Badge #7041.

---

## 0. Setup Required Before First Use

Unlike a purely local version, this app needs a **free Firebase project**
connected before it will show any data. This is a one-time setup, takes
about 10-15 minutes, and you do not need to write any backend code.

### Step 1 - Create the Firebase project
1. Go to <https://console.firebase.google.com>, sign in with a Google account.
2. Click **Add project**, give it any name (e.g. `lspd-notice-board`), you
   can disable Google Analytics (not needed). Click **Create project**.

### Step 2 - Create the Firestore database
1. In the left sidebar, click **Build > Firestore Database** > **Create database**.
2. Pick any location close to your players, choose **Start in production mode**, click **Create**.
3. Go to the **Rules** tab, delete everything there, and paste in the
   entire contents of `firestore/firestore.rules` (included in this
   project). Click **Publish**.
   - These rules let *anyone* read the data (so the Public Dashboard works
     with no login) but only a *signed-in* Command Staff account can write
     (add/edit/delete). This is the actual security boundary - the login
     screen is the front door, these rules are the lock.

### Step 3 - Enable sign-in and create your one admin account
1. Left sidebar > **Build > Authentication** > **Get started**.
2. Under **Sign-in method**, enable **Email/Password**, click **Save**.
3. Go to the **Users** tab > **Add user**. Enter the email and password
   Command Staff will sign in with, click **Add user**.
   - There's no sign-up screen anywhere in the app on purpose. This is the
     only way to create an account, matching the single-admin philosophy of
     this project. Add more users here later if more than one person needs
     admin access.

### Step 4 - Get your web app config
1. Click the gear icon (top left) > **Project settings**.
2. Scroll to **Your apps**, click the **Web** icon (`</>`).
3. Give it any nickname, click **Register app**. You do *not* need Firebase Hosting.
4. Firebase shows a `firebaseConfig` object. Copy it.

### Step 5 - Connect the app
Open `modules/firebase-config.js` in this project and paste your values in:

```js
export const firebaseConfig = {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
};
```

That's it - deploy as described below, sign in with the account from Step 3,
and start entering leave records. Every officer who opens the Public
Dashboard link will see updates within moments, automatically.

### Optional - load the sample data
`data/sample-data.json` has 43 example leave records across 40 officers,
useful for seeing every feature populated immediately. After connecting
Firebase, sign in to the Admin dashboard, go to **Reports > Import**, and
select that file. This *replaces* whatever is currently in the shared
database, so only do this on a fresh setup.

---

## 1. Structure

```
LSPD-Notice-Board/
├── index.html              Gateway / landing page
├── public-dashboard.html   Read-only dashboard (no login, real-time)
├── admin-dashboard.html    Command Staff sign-in + full CRUD command center
├── firestore/
│   └── firestore.rules     Paste into Firebase Console -> Firestore -> Rules
├── assets/css/style.css    Design tokens (light/dark), components, print styles
├── modules/                ES6 modules, one responsibility each (see §3)
├── data/sample-data.json   Optional demo data - load via Reports > Import
└── README.md
```

## 2. Deploying to GitHub Pages

1. Push this folder to a GitHub repository (root, or `/docs`).
2. Repository **Settings > Pages** > Source: **Deploy from a branch** >
   Branch: `main`, folder `/ (root)` > **Save**.
3. Wait 1-3 minutes, then open the URL GitHub shows you.

Everything else (Tailwind CSS, Font Awesome, Chart.js, Firebase SDK) loads
from CDNs - no `npm install`, no build. The repo can safely be **Public**:
real leave data never lives in the repo, only in your Firestore database
(and `data/sample-data.json`, which is just example data).

## 3. Architecture - the `modules/` folder

| Module | Responsibility |
|---|---|
| `firebase-config.js` | **The one file you edit.** Your project's Firebase credentials. |
| `firebase-init.js` | Initializes the Firebase app once, shared by storage.js and auth.js. |
| `storage.js` | **The only file that talks to Firestore.** Real-time `onSnapshot` listeners keep a local cache fresh and dispatch `lspd:data-changed` on every change - from this device or any other - so every view re-renders itself automatically. Everything else still reads/writes data only through `StorageService`. |
| `auth.js` | Firebase Authentication wrapper for the Admin login gate (sign in / out, auth-state watcher). No sign-up flow anywhere - see §0 Step 3. |
| `utils.js` | Domain constants (ranks/stations/divisions/leave types), date math, and `calculateStatus()` - the single source of truth for a leave's lifecycle status (see §5). |
| `ui.js` | Toast, modal, confirm dialog, theme switching (local to each device), sidebar drawer, status badges, avatar chips, the generic filter bar. |
| `dashboard.js` | KPI cards, Today's Coverage, auto-generated Insights, Upcoming Return / Upcoming Leave panels. |
| `leave.js` | Leave Management table, search, the Add/Edit form (with officer autocomplete), delete, and the shared Officer Detail modal. |
| `timeline.js` | The Gantt-style Leave Timeline - zoomable, horizontally scrollable, sticky officer column. |
| `calendar.js` | Monthly heatmap + event-chip calendar (see §6). |
| `statistics.js` | Chart.js dashboards (by month/rank/station/division/type, avg. duration). |
| `archive.js` | Finished-leave history: search, filter, export. |
| `report.js` | Export JSON/CSV, Print, Import JSON. |
| `settings.js` | Theme (local), Total Roster / Grace Period (shared), Backup/Restore/Reset. |
| `app-public.js` | Entry point for the Public Dashboard: chrome + tab routing, no auth. |
| `app-admin.js` | Entry point for Admin: same chrome/routing, gated behind `watchAuthState()` from auth.js - nothing in `#admin-app` renders until sign-in succeeds. |

**Every page module is self-mounting**: `initTimeline(container)`,
`initCalendar(container)`, etc. take an empty `<div>` and own it completely.
`admin-dashboard.html` mounts them with `{ editable: true }`;
`public-dashboard.html` mounts the same modules with `{ editable: false }`.

## 4. How the real-time sync works

`storage.js` opens a Firestore `onSnapshot` listener the moment
`StorageService.init()` is called. From then on:

- **Reads** (`getAll`, `getById`, `getSettings`) are synchronous, served from
  an in-memory cache that the listener keeps fresh.
- **Writes** (`add`, `update`, `remove`, `updateSettings`, `importJSON`,
  `resetDatabase`) are `async` - callers `await` them and Firestore pushes
  the confirmed change back through the *same* listener, which updates the
  cache and fires `lspd:data-changed` on `document`.

Every read-only view (Dashboard, Timeline, Calendar, Statistics, Archive)
just listens for that one event - it doesn't know or care whether the
change came from this browser or someone else's, which is what makes the
Public Dashboard update live with zero extra code in those modules.

Theme is deliberately **not** synced - it's a per-device display
preference, stored in `localStorage` only.

## 5. The status lifecycle

Status is **never stored** - it's computed live from `startDate` / `endDate`
every time data is read:

```
today < start                      -> Upcoming
start <= today <= end              -> Active
today == end + 1 (first day back)  -> Returning Today
1 .. graceDays after that           -> Overdue     (Command should follow up)
beyond graceDays                    -> Finished     (stable - moves to Archive)
```

`graceDays` (Settings, default **2**, shared) is the window for **Overdue**,
not Finished - a leave that ended long ago must eventually settle into a
*permanent* Finished/archived state, since there's no separate "mark as
returned" action anywhere in the app.

"Officers Available" = **Total Officer Roster** (Settings, shared) minus
officers currently Active. This app tracks leave only, not a full personnel
roster, so Total Roster is a single editable number.

## 6. Security model

- **Public Dashboard**: no login, read-only. Firestore rules allow anyone to read `leaveRecords` and `settings`.
- **Admin Dashboard**: gated behind a Firebase Authentication sign-in screen. There is no sign-up UI anywhere - the one (or more) Command Staff account(s) are created directly in the Firebase Console (§0 Step 3).
- **Firestore rules** are the real enforcement point: writes require `request.auth != null`, checked server-side by Firebase - not something that can be bypassed by editing the page's JavaScript.
- The Admin link is not shown anywhere on the Public Dashboard, and reaching `admin-dashboard.html` directly only ever shows the sign-in screen - no data or admin tools render before authentication succeeds.
- Forgot the admin password? Reset it from Firebase Console > Authentication > Users - there's no in-app recovery flow to keep the attack surface small.

## 7. A couple of deliberate simplifications

- **Heatmap Calendar + Leave Calendar are one component** (`calendar.js`):
  each day cell's background intensity shows how many officers are out
  (heatmap) *and* lists their name chips (Google-Calendar-style events) in
  the same cell, colored by status.
- **FullCalendar wasn't used** - the combined view above covers both
  calendar requirements with a lighter, dependency-free implementation.
- **Export/Import doubles as Backup/Restore** - same `leave-data.json`
  mechanism, exposed on both the Reports page and the Settings page.
- **Avatars are initials, not photos** - a deterministic colored initials
  chip instead of a broken image placeholder.

## 8. Credits

- **Design reference:** the server's existing LSPD branding (navy/slate/gold
  palette, Inter typeface, logo and profile card reused as-is).
- **Libraries (CDN only):** Tailwind CSS, Font Awesome 6.4, Chart.js 4, Firebase 12.
