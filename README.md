# LSPD Leave Management Dashboard

An operational Command Center for tracking Sick Leave, Leave of Absence, and
Vacation / Annual Leave across the Los Santos Police Department, built for
the **MotionLife GTA V FiveM Roleplay** server.

Static, client-side only. No backend, no build step, no login. Deploys
straight to **GitHub Pages**.

Designed & developed by **PamanahRasa** — Lieutenant OSS, Badge #7041.

---

## 1. Structure

```
LSPD-Leave-Dashboard/
├── index.html              Gateway / landing page
├── public-dashboard.html   Read-only dashboard (all officers)
├── admin-dashboard.html    Full CRUD command center (Command Staff)
├── assets/
│   ├── css/style.css       Design tokens (light/dark), components, print styles
│   ├── images/, icons/     (reserved - branding is currently loaded from the
│   │                        same hosted URLs as the LSPD Rookie Handbook)
├── modules/                ES6 modules, one responsibility each (see §3)
├── data/sample-data.json   Seed data - 40 officers / 43 leave records
└── README.md
```

Open `index.html` and choose **Public Dashboard** or **Command Staff Access**.
There is intentionally no login screen (see §5).

## 2. Deploying

1. Push this folder to a GitHub repository (root, or `/docs`).
2. Repository **Settings → Pages** → select the branch/folder → Save.
3. Done - everything is static HTML/CSS/JS loaded from CDNs (Tailwind CSS,
   Font Awesome, Chart.js, Google Fonts). No `npm install`, no build.

### Running it locally

The sample data auto-seeds via `fetch('data/sample-data.json')` on first
load. Browsers block `fetch()` on `file://` pages (CORS), so if you just
double-click `index.html` the seed step will silently no-op and the
dashboard opens empty - everything still works, you just start with an empty
database. Two ways around that:

- Serve the folder locally, e.g. `npx serve .` or VS Code's "Live Server", then open `http://localhost:.../index.html`, **or**
- Open the app empty, go to **Admin → Reports → Import**, and pick
  `data/sample-data.json` directly - the Import feature reads that same file.

## 3. Architecture - the `modules/` folder

| Module | Responsibility |
|---|---|
| `storage.js` | **The only file that touches LocalStorage.** Everything else reads/writes leave data through `StorageService`. Dispatches a `lspd:data-changed` event on every write so any open view re-renders itself. |
| `utils.js` | Domain constants (ranks/stations/divisions/leave types), date math, and `calculateStatus()` - the single source of truth for a leave's lifecycle status (see §4). |
| `ui.js` | Toast, modal, confirm dialog, theme switching, sidebar drawer, status badges, avatar chips, the generic filter bar. |
| `dashboard.js` | KPI cards, Today's Coverage, auto-generated Insights, Upcoming Return / Upcoming Leave panels. |
| `leave.js` | Leave Management table, search, the Add/Edit form (with officer autocomplete), delete, and the shared Officer Detail modal. |
| `timeline.js` | The Gantt-style Leave Timeline - zoomable, horizontally scrollable, sticky officer column. |
| `calendar.js` | Monthly heatmap + event-chip calendar (see §6 for why these are one component). |
| `statistics.js` | Chart.js dashboards (by month/rank/station/division/type, avg. duration). |
| `archive.js` | Finished-leave history: search, filter, export. |
| `report.js` | Export JSON/CSV, Print, Import JSON. |
| `settings.js` | Theme, Total Roster, Grace Period, Backup/Restore/Reset. |
| `app-public.js` / `app-admin.js` | Entry points: wire the chrome (sidebar, clock, theme) and route between tabs, lazily initializing each page module the first time its tab is opened. |

**Every page module is self-mounting**: `initTimeline(container)`,
`initCalendar(container)`, etc. take an empty `<div>` and own it completely,
including re-rendering themselves whenever `StorageService` reports a data
change. `admin-dashboard.html` mounts them with `{ editable: true }`;
`public-dashboard.html` mounts the same modules with `{ editable: false }` -
that's the entire mechanism behind "one read-only dashboard, one CRUD
dashboard" with zero duplicated rendering logic.

### Migrating off LocalStorage later

`StorageService` exposes `init / getAll / getById / add / update / remove /
getSettings / updateSettings / exportJSON / importJSON / resetDatabase`.
Swap the inside of `storage.js` for a Firebase/Supabase/REST implementation
that exposes the same functions and dispatches the same `lspd:data-changed`
event, and nothing in Dashboard, Timeline, Calendar, Statistics, Leave
Management, Archive, or Reports needs to change.

## 4. The status lifecycle (important - read this before changing dates)

Status is **never stored** - it's computed live from `startDate` / `endDate`
every time data is read, so it can never drift out of sync:

```
today < start                      → Upcoming
start <= today <= end              → Active
today == end + 1 (first day back)  → Returning Today
1 .. graceDays after that           → Overdue     (Command should follow up)
beyond graceDays                    → Finished     (stable - moves to Archive)
```

`graceDays` (Settings, default **2**) is deliberately the window for
**Overdue**, not Finished. Since this app has no "mark as returned" action
(everything is date-driven, per spec), a leave that ended a long time ago
must eventually settle into a **permanent** Finished/archived state -
otherwise every old record would stay flagged Overdue forever. Overdue is
therefore a short, actionable alert right after the expected return date;
Finished is the stable, terminal state that populates the Leave Archive.

"Officers Available" is calculated as **Total Officer Roster (Settings) −
officers currently Active**. This dashboard only tracks leave, not a full
personnel roster, so Total Roster is a single editable number rather than a
full staff list.

## 5. No login, by design

Per the brief, this is a single-admin tool: "Do not implement login... keep
the workflow simple." `admin-dashboard.html` has no authentication - anyone
with the link/file can open it. That's fine for a trusted, single-operator
FiveM faction tool, but it also means:

- Don't deploy this somewhere the general public can reach the admin URL if
  that would be a problem for your faction.
- Data lives in each *browser's* LocalStorage, per device - it does **not**
  sync between computers on its own. Use Reports → Export JSON regularly and
  Import it wherever you need the same data (this doubles as your backup;
  see Settings → Backup/Restore, which is the same feature).

## 6. A couple of deliberate simplifications

- **Heatmap Calendar + Leave Calendar are one component** (`calendar.js`):
  each day cell's background intensity shows how many officers are out
  (heatmap) *and* lists their name chips (Google-Calendar-style events) in
  the same cell, colored by status. Two requirements, one view, no
  duplicated calendar code.
- **FullCalendar wasn't used.** The combined view above covers both calendar
  requirements with a lighter, dependency-free implementation, per the
  brief's "if necessary" on FullCalendar.
- **Export/Import doubles as Backup/Restore.** Both are listed separately in
  the brief; underneath they're the same `leave-data.json` mechanism, just
  exposed on both the Reports page and the Settings page for convenience,
  so there's one code path instead of four near-identical ones.
- **Avatars are initials, not photos.** No officer headshots exist in this
  system, so each officer gets a deterministic colored initials chip instead
  of a broken image placeholder.

## 7. Sample data

`data/sample-data.json` ships with 40 officers / 43 leave records spanning
every status (Active, Upcoming, Returning Today, Overdue, Finished) so the
Dashboard, Timeline, Calendar and Statistics all have something meaningful
to show immediately. Reset anytime via Settings → Reset Local Database, or
re-import the same file via Reports → Import.

## 8. Credits

- **Design reference:** LSPD Rookie Handbook (same server, same branding -
  navy/slate/gold palette, Inter typeface, logo and profile card reused
  as-is).
- **Libraries (CDN only):** Tailwind CSS, Font Awesome 6.4, Chart.js 4.
- Built for **MotionLife Roleplay**.
