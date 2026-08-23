const VATSIM_DATA_URL = "https://data.vatsim.net/v3/vatsim-data.json";
const POLL_INTERVAL_MS = 2 * 60 * 1000;

interface RawVatsimPilot {
  cid: number;
  callsign: string;
}

async function isConnectedNow(cid: string, callsign: string): Promise<boolean> {
  try {
    const res = await fetch(VATSIM_DATA_URL);
    if (!res.ok) return false;
    const data: { pilots: RawVatsimPilot[] } = await res.json();
    return data.pilots.some(
      (p) => String(p.cid) === cid && p.callsign.toUpperCase() === callsign.toUpperCase()
    );
  } catch {
    return false;
  }
}

/**
 * Polls the public VATSIM data feed throughout the flight and remembers
 * whether the pilot's CID/callsign was ever seen connected — a single
 * check at the moment the PIREP is filed would miss a pilot who
 * disconnects right as they land.
 */
export class VatsimConnectionWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private everSeenConnected = false;

  start(cid: string, callsign: string): void {
    const check = () => {
      isConnectedNow(cid, callsign).then((connected) => {
        if (connected) this.everSeenConnected = true;
      });
    };
    check();
    this.timer = setInterval(check, POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get wasVerified(): boolean {
    return this.everSeenConnected;
  }
}
