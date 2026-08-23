# Air France Virtual ACARS

A free, open-source, self-hosted flight-tracking ("ACARS") desktop client for Microsoft Flight Simulator, built for Air France Virtual. Replaces the paid tracker built into tools like smartCARS/VAMsys: it connects to MSFS over SimConnect, detects flight phases automatically, scores the landing/taxi/fuel-reserve the same way the web portal's manual PIREP form does, and files the PIREP straight to the same Firebase project the portal uses — no separate backend, no extra hosting cost.

**Companion project to** [`air-france-virtual`](../air-france-virtual) (the web portal). They share one Firebase project.

## Cost

$0 beyond what the web portal already costs to run.

- SimConnect (MSFS's telemetry API) — free, part of the sim.
- [`node-simconnect`](https://github.com/EvenAR/node-simconnect) — a pure-TypeScript, cross-platform SimConnect client. **License note**: it's LGPL-3.0-or-later, not MIT — fine for a project built and distributed as open source like this one, since it's used as an ordinary npm dependency (not modified/statically embedded).
- Electron — free, open source.
- Writes directly to the portal's existing Firebase project via the standard client SDK and security rules — no service account, no server function, Spark (free) tier plan is enough for hobby-VA PIREP volume.

## Requirements to actually fly with it

- **Windows**, because MSFS only runs on Windows. This app can be *developed* on macOS/Linux (nothing about it needs Windows to build or type-check), but the real SimConnect connection only works where MSFS is running.
- MSFS 2020 or 2024, running on the same machine (default) — or a different Windows machine on your LAN, if you edit that machine's `SimConnect.xml` to accept external connections (see below).

## Setup

```bash
npm install
cp .env.example .env   # fill in the SAME Firebase config as the web portal's .env.local
npm start               # launches the Electron app
```

The `.env` values are the portal's own `NEXT_PUBLIC_FIREBASE_*` values (drop the `NEXT_PUBLIC_` prefix, they're the same Firebase web app config either way).

### Mock mode (no MSFS required)

The status window has a **"Use Mock Flight (dev)"** button that plays back a scripted synthetic flight through the exact same phase-detection and PIREP-filing pipeline as a real SimConnect connection — useful for development, and for confirming the whole app works before you're at your simulator PC. `scripts/verify-mock-flight.ts` runs the same mock flight completely headlessly and writes/reads back/deletes a real test PIREP — handy as a smoke test after any change:

```bash
node --env-file=.env node_modules/.bin/tsx scripts/verify-mock-flight.ts you@example.com yourPassword
```

### Connecting to MSFS on a different Windows machine

By default `node-simconnect` looks for a SimConnect server on the same machine (named pipe, or a local TCP port from `SimConnect.cfg`/the registry). To connect from a different machine on your LAN, edit `SimConnect.xml` on the **MSFS machine** (`%LOCALAPPDATA%\Packages\Microsoft.FlightSimulator_<id>\LocalCache\SimConnect.xml`) and change `<Address>127.0.0.1</Address>` to `<Address>0.0.0.0</Address>`, then pass `{ host, port }` into `SimConnectTelemetrySource.connect()`.

## What it does

1. Log in with your portal account (same Firebase Auth).
2. Pick your current booking, or enter departure/arrival/aircraft/callsign manually.
3. Fly. The status window shows live phase (`PREFLIGHT → TAXI_OUT → TAKEOFF → CLIMB → CRUISE → DESCENT → APPROACH → LANDING → TAXI_IN → SHUTDOWN → COMPLETE`), altitude, speed, and fuel.
4. On landing and shutdown, review a completion summary (times, landing rate, computed points, any cheat/abuse flags) and hit **Submit PIREP**.
5. The PIREP lands in the portal's admin queue with `source: "acars"`, exactly like a manual submission plus richer flight-time/telemetry/cheat-flag data.

### What gets flagged (never blocked client-side)

- Sim rate ever ≠ 1x during the flight.
- Total time spent paused.
- Distance actually flown looking implausibly short for the booked/entered route.
- VATSIM network selected but the pilot's CID/callsign was never seen connected on the public VATSIM data feed during the flight — this only sets a `networkUnverified` flag, it doesn't change what you filed.

All of this is stored as data on the PIREP; the portal's admin approval flow (unchanged) makes the actual call.

### Known simplification

Landing distance from the runway threshold needs the runway's real-world position, which SimConnect doesn't hand you directly — it needs a facility/runway lookup (`node-simconnect` supports this via its facilities API, see its `samples/typescript/facilities.ts`). This first pass defaults that field to 0 and lets you correct it on the completion-summary screen before submitting, same as every other field there.

### A Firestore gotcha worth knowing if you extend this

If you ever read a `pireps/{id}/telemetry` subcollection back as a non-admin (e.g. building an in-app "my past flights" viewer in this client), you must query it with `where("pilotUid", "==", <the pirep's own pilotUid>)` — a plain unconstrained `getDocs(collection(...))` is **rejected outright** by the portal's `firestore.rules`, even though every individual document would pass the ownership check. Firestore requires a `list` query to be provably safe against a rule that inspects `resource.data`; only the `isAdmin()` branch of that rule is exempt (it doesn't depend on `resource.data`), which is why this only bites non-admin readers. Caught by `scripts/verify-mock-flight.ts` during development — see its `getDocs(query(..., where(...)))` call for the working pattern, and the matching fix in the portal's `src/lib/telemetry.ts`.

## Project layout

- `src/shared/` — types and pure logic shared across main/renderer (`TelemetrySample`, ACARS scoring ported verbatim from the portal, great-circle distance, the mirrored route list).
- `src/flight/` — the phase state machine (`phase-tracker.ts`) and the stateful `FlightSession` that wraps it with timing/fuel/cheat-flag/telemetry-buffering logic. Both are pure/deterministic and unit-tested (`npm test`) with no Electron or Firebase dependency.
- `src/telemetry/` — `SimConnectTelemetrySource` (real) and `MockTelemetrySource` (synthetic), both implementing the same `TelemetrySource` interface.
- `src/main/` — main-process only: owns the active telemetry source, streams samples to the renderer over IPC. Never touches Firebase.
- `src/renderer/` — renderer-process only: Firebase Auth/Firestore (browser-like environment), booking lookup, PIREP assembly and write, VATSIM cross-check, and the plain-DOM UI wired up in `src/renderer.ts`.
- `src/preload.ts` — the only bridge between the two, via `contextBridge` (`contextIsolation: true`, `nodeIntegration: false`).

## Testing

```bash
npm test          # vitest — phase-tracker and FlightSession unit tests
npx tsc --noEmit  # type-check
npm run lint
```

The real SimConnect connection cannot be tested on a non-Windows dev machine — everything else (phase detection, timing, PIREP assembly, the actual Firestore write) is covered by the unit tests plus `scripts/verify-mock-flight.ts`, which was used to validate this against the live Firebase project during development. Your own first real flight on Windows is the final check on the SimConnect wiring itself.

## Packaging a Windows installer

```bash
npm run make
```

This must be run **on Windows** — `electron-builder`/Forge's Squirrel maker can't reliably cross-build a Windows installer from macOS/Linux. Output lands in `out/make/`.
