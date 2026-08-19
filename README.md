# LSPD Notice Board

An operational Command Center for tracking Sick Leave, Leave of Absence, and
Open-Ended Leave across the Los Santos Police Department. Built for a GTA V
FiveM Roleplay server.

Static frontend (HTML/CSS/JS, deploys to GitHub Pages, no build step) backed
by **Firebase** (Firestore + Authentication) so every change an admin makes
is visible **in real time** to anyone viewing the Public Dashboard, on any
device, anywhere.

Designed & developed by **PamanahRasa** — Lieutenant OSS, Badge #7041.

---

## 0. Setup Required Before First Use

Unlike a purely local version, this app needs a **free Firebase project**
connected before it will show any data. One-time setup, ~10-15 minutes, no
backend code to write.

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
   - `leaveRecords` and `settings` are readable by *anyone* (so the Public
     Dashboard works with no login) but only a *signed-in* Command Staff
     account can write. `adminMeta` (the Settings-page PIN, §6) is not
     even readable without being signed in. This is the actual security
     boundary - the login screen is the front door, these rules are the lock.

### Step 3 - Enable sign-in and create your one admin account
1. Left sidebar > **Build > Authentication** > **Get started**.
2. Under **Sign-in method**, enable **Email/Password**, click **Save**.
3. Go to the **Users** tab > **Add user**. Enter the email and password
   Command Staff will sign in with, click **Add user**.
   - There's no sign-up screen anywhere in the app on purpose. This is the
     only way to create an account. Add more users here later if more than
     one person needs admin access.

### Step 4 - Get your web app config
1. Click the gear icon (top left) > **Project settings**.
2. Scroll to **Your apps**, click the **Web** icon (`</>`).
3. Give it any nickname, click **Register app**. You do *not* need Firebase Hosting.
4. Firebase shows a `firebaseConfig` object. Copy it.

### Step 5 - Connect the app
Open `modules/firebase-config.js` and paste your values in:

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

Deploy as described below, sign in with the account from Step 3, and start
entering leave records. The first time you open **Settings**, you'll be
asked to create a Settings PIN (§6) - that's separate from your Firebase
login.

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

Everything else (Tailwind CSS, Font Awesome, Chart.js, ExcelJS, Firebase SDK)
loads from CDNs - no `npm install`, no build. The repo can safely be
**Public**: real leave data never lives in the repo, only in your Firestore
database (and `data/sample-data.json`, which is just example data).

## 3. Architecture - the `modules/` folder

| Module | Responsibility |
|---|---|
| `firebase-config.js` | **The one file you edit.** Your project's Firebase credentials. |
| `firebase-init.js` | Initializes the Firebase app once, shared by storage.js and auth.js. |
| `storage.js` | **The only file that talks to Firestore.** Real-time `onSnapshot` listeners keep a local cache fresh and dispatch `lspd:data-changed` on every change - from this device or any other. Everything else reads/writes data only through `StorageService`. |
| `auth.js` | Firebase Authentication wrapper for the Admin login gate (sign in / out, auth-state watcher). No sign-up flow - see §0 Step 3. |
| `utils.js` | Domain constants (ranks/stations/divisions/leave types), date math, `calculateStatus()` (§5), and the SHA-256 helper used by the Settings PIN (§6). |
| `ui.js` | Toast, modal, confirm dialog, theme switching (local to each device), sidebar drawer, status badges, avatar chips, the Open-Ended Leave badge, the generic filter bar. |
| `officer-search.js` | Global "Search Officer" (header, both dashboards) - find anyone by name/badge and jump straight to their full detail + leave history. |
| `dashboard.js` | KPI cards (incl. AWOL), Today's Coverage, auto-generated Insights, Upcoming Return / Upcoming Leave panels. |
| `leave.js` | Leave Management table, search, the Add/Edit form (with officer autocomplete), delete, **Confirm Returned**, and the shared Officer Detail modal. |
| `timeline.js` | The Gantt-style Leave Timeline - zoomable, horizontally scrollable, sticky officer column, AWOL pulse, Open-Ended dashed outline. |
| `calendar.js` | Monthly heatmap + event-chip calendar (see §7). |
| `statistics.js` | Chart.js dashboards (by month/rank/station/division/type, avg. duration), Open-Ended Leave in its own accent color. |
| `archive.js` | Finished (confirmed-returned) leave history: search, filter, Excel export. |
| `xlsx-export.js` | Shared, styled/bordered `.xlsx` builder (ExcelJS) used by both Reports and Archive export. |
| `report.js` | Export JSON/Excel, Print, Import JSON. |
| `settings.js` | PIN-gated (§6): theme (local), Total Roster / Grace Period (shared), Backup/Restore/Reset. |
| `app-public.js` | Entry point for the Public Dashboard: chrome + tab routing + global search, no auth. |
| `app-admin.js` | Entry point for Admin: same chrome/routing, gated behind `watchAuthState()` - nothing in `#admin-app` renders until sign-in succeeds. |

**Every page module is self-mounting**: `initTimeline(container)`,
`initCalendar(container)`, etc. take an empty `<div>` and own it completely.
`admin-dashboard.html` mounts them with `{ editable: true }`;
`public-dashboard.html` mounts the same modules with `{ editable: false }`.

## 4. How the real-time sync works

`storage.js` opens a Firestore `onSnapshot` listener the moment
`StorageService.init()` is called.

- **Reads** (`getAll`, `getById`, `getSettings`) are synchronous, served from
  an in-memory cache the listener keeps fresh.
- **Writes** (`add`, `update`, `remove`, `updateSettings`, `importJSON`,
  `resetDatabase`) are `async` - callers `await` them and Firestore pushes
  the confirmed change back through the *same* listener, which updates the
  cache and fires `lspd:data-changed` on `document`.

Every read-only view listens for that one event and doesn't care whether the
change came from this browser or someone else's - that's what makes the
Public Dashboard update live with zero extra code in those modules.

Theme is deliberately **not** synced - a per-device preference in
`localStorage` only.

## 5. The status lifecycle - Confirm Returned & AWOL

Status is **never stored** - it's computed live every time data is read, but
it now depends on one thing besides the dates: whether Command has
explicitly **confirmed the officer returned to duty**.

```
confirmedReturned === true          -> Finished     (stable - moves to Archive)
today < start                       -> Upcoming
start <= today <= end                -> Active
today == end + 1 (first day back)   -> Returning Today
1 .. graceDays after that            -> Overdue      (pending confirmation)
beyond graceDays, still unconfirmed  -> AWOL          (pending confirmation, urgent)
```

**Confirm Returned** (Leave Management, and Officer Detail) is the *only*
way a record becomes Finished. Click it any time an officer is actually
back - even early, while still Active. Until then, an unconfirmed leave
past its grace period stays **AWOL indefinitely** (it does not quietly
auto-resolve), because only Command confirming return is treated as ground
truth here - there's no attendance system to infer it automatically. This
write goes straight to Firestore, so the change (and the AWOL flag itself)
is identical on the Admin and Public dashboards immediately.

`graceDays` (Settings, default **2**, shared) is how long a record stays
**Overdue** before escalating to **AWOL**.

"Officers Available" = **Total Officer Roster** (Settings, shared) minus
everyone not yet confirmed back (Active + Returning Today + Overdue + AWOL) -
so Available + On Leave always sums back to the Roster total.

## 6. Security model

- **Public Dashboard**: no login, read-only, no admin link anywhere in its UI. Firestore rules allow anyone to read `leaveRecords` and `settings`.
- **Admin Dashboard**: gated behind Firebase Authentication. No sign-up UI - the Command Staff account is created in Firebase Console (§0 Step 3).
- **Settings tab (inside Admin)**: gated a second time, behind a **Settings PIN** (4-8 digits) - separate from the Firebase login. First visit prompts you to create one; every visit after that asks for it. Stays unlocked for the rest of that browser session (re-locks on reload, or the "Lock Settings" button). Change it anytime from within Settings.
  - The PIN's hash lives in Firestore at `adminMeta/settingsPin`, which - unlike `settings/app` - is **not** publicly readable; only a signed-in account can read or write it. This is a lightweight convenience check for an already-authenticated admin, not a replacement for the real Firebase sign-in.
- **Firestore rules** are the real enforcement point for data: writes require `request.auth != null`, checked server-side - not bypassable by editing the page's JavaScript.
- Forgot the Firebase password? Reset it from Firebase Console > Authentication > Users. Forgot the Settings PIN? Any signed-in admin can currently only reset it by deleting the `adminMeta/settingsPin` document directly in Firebase Console (Firestore Database > Data) - it will prompt to create a new one next visit.

## 7. A couple of deliberate simplifications

- **Heatmap Calendar + Leave Calendar are one component** (`calendar.js`):
  each day cell's background intensity shows how many officers are out
  *and* lists their name chips, colored by status.
- **FullCalendar wasn't used** - the combined view above is lighter and
  dependency-free.
- **Export/Import doubles as Backup/Restore** - same `leave-data.json`
  mechanism, exposed on both the Reports page and the Settings page.
- **Open-Ended Leave still has a Start/End date.** "Open-ended" here is a
  *category* (no firm return commitment) rather than a literally-unbounded
  record - the app flags it visually everywhere (violet ♾ badge/outline in
  the table, timeline, calendar and statistics) rather than changing how
  dates are stored. If you need truly date-less leave tracking, that's a
  larger structural change - ask and it can be built.
- **Avatars are initials, not photos** - a deterministic colored initials
  chip instead of a broken image placeholder.

## 8. Credits

- **Design reference:** the server's existing LSPD branding (navy/slate/gold
  palette, Inter typeface, logo and profile card reused as-is).
- **Libraries (CDN only):** Tailwind CSS, Font Awesome 6.4, Chart.js 4, ExcelJS 4.4, Firebase 12.
