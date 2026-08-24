import "./index.css";
import type {} from "./renderer/global";
import { signIn, watchAuthState, loadPilot } from "./renderer/auth";
import { getPilotBookings } from "./renderer/bookings";
import { submitAcarsPirep } from "./renderer/pireps";
import { buildAcarsPirep, FlightSetup } from "./renderer/pirep-builder";
import { VatsimConnectionWatcher } from "./renderer/vatsim";
import { FlightSession } from "./flight/flight-session";
import { FlightPhase } from "./flight/phase-tracker";
import { ConnectionStatus, TelemetrySample } from "./shared/telemetry-types";
import { AircraftType, Booking, NetworkUsed, Pilot } from "./shared/pirep-schema";
import { ROUTE_LOOKUP } from "./shared/route-lookup";

// ---- DOM refs -----------------------------------------------------------

const screens = {
  login: document.getElementById("screen-login")!,
  booking: document.getElementById("screen-booking")!,
  tracking: document.getElementById("screen-tracking")!,
  summary: document.getElementById("screen-summary")!,
  submitted: document.getElementById("screen-submitted")!,
};

function showScreen(name: keyof typeof screens) {
  Object.entries(screens).forEach(([key, el]) => el.classList.toggle("hidden", key !== name));
}

const statusDot = document.getElementById("status-dot")!;

// ---- App state ------------------------------------------------------------

let currentPilot: Pilot | null = null;
let session: FlightSession | null = null;
let setup: FlightSetup | null = null;
let plannedDistanceNm: number | undefined;
let vatsimWatcher: VatsimConnectionWatcher | null = null;

// ---- Auth -----------------------------------------------------------------

// The AFV Installer passes the signed-in pilot's email as a launch arg so
// they don't have to retype it here — password still has to be entered the
// first time, but Firebase's own session persistence keeps them signed in
// on every launch after that, from either the installer or this app directly.
if (window.launch.prefillEmail) {
  const emailInput = document.getElementById("login-email") as HTMLInputElement;
  emailInput.value = window.launch.prefillEmail;
  document.getElementById("login-password")?.focus();
}

watchAuthState(async (user) => {
  if (!user) {
    showScreen("login");
    return;
  }
  currentPilot = await loadPilot(user.uid);
  if (!currentPilot) {
    document.getElementById("login-error")!.textContent = "No pilot record found for this account.";
    showScreen("login");
    return;
  }
  await showBookingScreen(currentPilot.uid);
});

document.getElementById("login-form")!.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = (document.getElementById("login-email") as HTMLInputElement).value;
  const password = (document.getElementById("login-password") as HTMLInputElement).value;
  const errorEl = document.getElementById("login-error")!;
  errorEl.textContent = "";
  try {
    await signIn(email, password);
  } catch (err) {
    errorEl.textContent = err instanceof Error ? err.message : "Unable to log in.";
  }
});

// ---- Booking selection ------------------------------------------------------

async function showBookingScreen(pilotUid: string) {
  showScreen("booking");
  const bookings = await getPilotBookings(pilotUid);
  const listEl = document.getElementById("booking-list")!;
  listEl.innerHTML = "";

  if (bookings.length === 0) {
    listEl.innerHTML = '<p style="color:var(--slate);font-size:11px;">No current bookings.</p>';
  }

  bookings.forEach((booking) => {
    const route = ROUTE_LOOKUP[booking.routeId];
    const item = document.createElement("div");
    item.className = "booking-item";
    item.innerHTML = `<span>${route ? route.flightNumber : booking.routeId} · ${route ? `${route.departureIcao} → ${route.arrivalIcao}` : ""}</span><span>${booking.aircraftType}</span>`;
    item.addEventListener("click", () => startFromBooking(booking));
    listEl.appendChild(item);
  });
}

function startFromBooking(booking: Booking) {
  const route = ROUTE_LOOKUP[booking.routeId];
  if (!route || !currentPilot) return;
  plannedDistanceNm = route.distanceNm;
  setup = {
    pilotUid: currentPilot.uid,
    pilotId: currentPilot.pilotId,
    pilotName: currentPilot.displayName,
    routeId: booking.routeId,
    flightNumber: route.flightNumber,
    departureIcao: route.departureIcao,
    arrivalIcao: route.arrivalIcao,
    aircraftType: booking.aircraftType,
    network: "VATSIM",
    requiredReserveKg: 2000,
    paxCount: 0,
    cargoKg: 0,
    remarks: "",
  };
  startTracking();
}

document.getElementById("manual-form")!.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!currentPilot) return;
  const val = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement).value;

  plannedDistanceNm = undefined;
  setup = {
    pilotUid: currentPilot.uid,
    pilotId: currentPilot.pilotId,
    pilotName: currentPilot.displayName,
    routeId: null,
    flightNumber: val("manual-flightNumber").toUpperCase(),
    departureIcao: val("manual-departure").toUpperCase(),
    arrivalIcao: val("manual-arrival").toUpperCase(),
    aircraftType: val("manual-aircraft") as AircraftType,
    network: val("manual-network") as NetworkUsed,
    requiredReserveKg: Number(val("manual-reserve")) || 0,
    paxCount: Number(val("manual-pax")) || 0,
    cargoKg: Number(val("manual-cargo")) || 0,
    remarks: "",
  };
  startTracking();
});

// ---- Tracking ---------------------------------------------------------------

function startTracking() {
  if (!setup) return;
  session = new FlightSession(plannedDistanceNm);
  showScreen("tracking");
  document.getElementById("tracking-route")!.textContent =
    `${setup.flightNumber} · ${setup.departureIcao} → ${setup.arrivalIcao}`;

  if (setup.network === "VATSIM" && currentPilot) {
    vatsimWatcher = new VatsimConnectionWatcher();
    vatsimWatcher.start(currentPilot.vatsimCid, setup.flightNumber);
  }

  window.telemetry.connect("simconnect");
}

document.getElementById("mock-flight-btn")!.addEventListener("click", () => {
  window.telemetry.disconnect().then(() => window.telemetry.connect("mock"));
});

window.telemetry.onStatusChange((status: ConnectionStatus) => {
  statusDot.className = `status-dot status-${status}`;
});

window.telemetry.onTick((sample: TelemetrySample) => {
  if (!session) return;
  const event = session.process(sample);
  renderTelemetry(sample, event.phase);

  if (event.phase === "COMPLETE") {
    finishFlight();
  }
});

function renderTelemetry(sample: TelemetrySample, phase: FlightPhase) {
  document.getElementById("phase-badge")!.textContent = phase.replace(/_/g, " ");
  document.getElementById("tel-alt")!.textContent = `${Math.round(sample.altMslFt).toLocaleString()} ft`;
  document.getElementById("tel-gs")!.textContent = `${Math.round(sample.groundSpeedKt)} kt`;
  document.getElementById("tel-vs")!.textContent = `${Math.round(sample.verticalSpeedFpm)} fpm`;
  document.getElementById("tel-fuel")!.textContent = `${Math.round(sample.fuelTotalKg).toLocaleString()} kg`;
}

// ---- Completion + submission -------------------------------------------------

let pendingResult: ReturnType<FlightSession["finalize"]> | null = null;

function finishFlight() {
  if (!session) return;
  pendingResult = session.finalize();
  vatsimWatcher?.stop();
  showScreen("summary");
  renderSummary(pendingResult);
}

function renderSummary(result: NonNullable<typeof pendingResult>) {
  const grid = document.getElementById("summary-grid")!;
  grid.innerHTML = `
    <div><dt>Block Time</dt><dd>${result.blockTimeMinutes.toFixed(0)} min</dd></div>
    <div><dt>Flight Time</dt><dd>${result.flightTimeMinutes.toFixed(0)} min</dd></div>
    <div><dt>Landing Rate</dt><dd>${result.landingRateFpm.toFixed(0)} fpm</dd></div>
    <div><dt>Fuel Used</dt><dd>${result.fuelUsedKg.toFixed(0)} kg</dd></div>
  `;

  const flagsEl = document.getElementById("summary-flags")!;
  flagsEl.innerHTML = "";
  const flags = result.cheatFlags;
  if (flags.simRateFlag) flagsEl.innerHTML += `<div class="flag">Sim rate was not 1x during this flight.</div>`;
  if (flags.pauseFlag)
    flagsEl.innerHTML += `<div class="flag">Simulator was paused for ~${flags.pausedDurationSeconds}s.</div>`;
  if (flags.distanceMismatchFlag)
    flagsEl.innerHTML += `<div class="flag">Distance flown (${flags.distanceFlownNm}nm) looks short for this route.</div>`;
  if (vatsimWatcher && setup?.network === "VATSIM" && !vatsimWatcher.wasVerified) {
    flagsEl.innerHTML += `<div class="flag">Could not verify VATSIM connection for this flight — flagged for manual review.</div>`;
  }
}

document.getElementById("submit-pirep-btn")!.addEventListener("click", async () => {
  if (!pendingResult || !setup) return;
  const statusEl = document.getElementById("submit-status")!;
  const remarks = (document.getElementById("summary-remarks") as HTMLTextAreaElement).value;
  setup.remarks = remarks;

  statusEl.textContent = "Submitting…";
  try {
    const networkVerified = vatsimWatcher ? vatsimWatcher.wasVerified : true;
    const pirep = buildAcarsPirep(setup, pendingResult, networkVerified);
    await submitAcarsPirep(pirep, pendingResult.telemetryFull, pendingResult.approachHighRes);
    showScreen("submitted");
  } catch (err) {
    statusEl.textContent = err instanceof Error ? err.message : "Unable to submit PIREP.";
  }
});

document.getElementById("new-flight-btn")!.addEventListener("click", () => {
  session = null;
  setup = null;
  pendingResult = null;
  if (currentPilot) showBookingScreen(currentPilot.uid);
});
