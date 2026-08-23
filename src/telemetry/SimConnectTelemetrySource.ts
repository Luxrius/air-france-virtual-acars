import {
  open,
  Protocol,
  SimConnectConstants,
  SimConnectDataType,
  SimConnectPeriod,
  type SimConnectConnection,
} from "node-simconnect";
import { TelemetrySample, TelemetrySource } from "../shared/telemetry-types";

const DEFINITION_LIVE_DATA = 0;
const REQUEST_LIVE_DATA = 0;
const EVENT_PAUSE = 0;

const RECONNECT_DELAY_MS = 5000;

/**
 * Wraps node-simconnect to stream live MSFS telemetry. Main-process only
 * (Node networking, no DOM). Runs on the same machine as MSFS by default
 * (named pipe / local TCP auto-discovery via SimConnect.cfg or the Windows
 * registry); to connect to MSFS running on a different Windows machine on
 * the LAN, pass `{ remote: { host, port } }` to connect() — the MSFS-side
 * SimConnect.xml must have its <Address> opened up to allow that, see the
 * README.
 *
 * This class cannot be exercised on this dev machine (macOS, no MSFS) —
 * it's built directly against node-simconnect's real type definitions and
 * documented SimConnect variable/unit names, but its first real test is on
 * a Windows machine with MSFS running. Use MockTelemetrySource for
 * everything else.
 */
export class SimConnectTelemetrySource implements TelemetrySource {
  private handle: SimConnectConnection | null = null;
  private sampleCbs: ((sample: TelemetrySample) => void)[] = [];
  private disconnectCbs: (() => void)[] = [];
  private paused = false;
  private shouldReconnect = true;

  async connect(remote?: { host: string; port: number }): Promise<void> {
    this.shouldReconnect = true;
    await this.attemptConnect(remote);
  }

  onSample(cb: (sample: TelemetrySample) => void): void {
    this.sampleCbs.push(cb);
  }

  onDisconnect(cb: () => void): void {
    this.disconnectCbs.push(cb);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.handle?.close();
    this.handle = null;
  }

  private async attemptConnect(remote?: { host: string; port: number }): Promise<void> {
    try {
      const { handle } = await open(
        "Air France Virtual ACARS",
        Protocol.KittyHawk,
        remote ? { remote } : undefined
      );
      this.handle = handle;
      this.registerDataDefinition(handle);
      this.registerEventHandlers(handle, remote);
    } catch {
      this.scheduleReconnect(remote);
    }
  }

  private scheduleReconnect(remote?: { host: string; port: number }): void {
    if (!this.shouldReconnect) return;
    setTimeout(() => this.attemptConnect(remote), RECONNECT_DELAY_MS);
  }

  private registerDataDefinition(handle: SimConnectConnection): void {
    // Read order below must exactly match the RawBuffer read order in the
    // simObjectData handler.
    handle.addToDataDefinition(DEFINITION_LIVE_DATA, "PLANE LATITUDE", "degrees", SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(DEFINITION_LIVE_DATA, "PLANE LONGITUDE", "degrees", SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(DEFINITION_LIVE_DATA, "PLANE ALTITUDE", "feet", SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(DEFINITION_LIVE_DATA, "PLANE ALT ABOVE GROUND", "feet", SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(DEFINITION_LIVE_DATA, "GROUND VELOCITY", "knots", SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(DEFINITION_LIVE_DATA, "VERTICAL SPEED", "feet per minute", SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(
      DEFINITION_LIVE_DATA,
      "PLANE HEADING DEGREES TRUE",
      "degrees",
      SimConnectDataType.FLOAT64
    );
    handle.addToDataDefinition(DEFINITION_LIVE_DATA, "SIM ON GROUND", "bool", SimConnectDataType.INT32);
    handle.addToDataDefinition(
      DEFINITION_LIVE_DATA,
      "FUEL TOTAL QUANTITY WEIGHT",
      "kilograms",
      SimConnectDataType.FLOAT64
    );
    handle.addToDataDefinition(DEFINITION_LIVE_DATA, "SIMULATION RATE", "number", SimConnectDataType.FLOAT64);
    handle.addToDataDefinition(DEFINITION_LIVE_DATA, "GENERAL ENG COMBUSTION:1", "bool", SimConnectDataType.INT32);
    handle.addToDataDefinition(DEFINITION_LIVE_DATA, "GENERAL ENG COMBUSTION:2", "bool", SimConnectDataType.INT32);
    handle.addToDataDefinition(DEFINITION_LIVE_DATA, "ATC ID", null, SimConnectDataType.STRING32);

    handle.requestDataOnSimObject(
      REQUEST_LIVE_DATA,
      DEFINITION_LIVE_DATA,
      SimConnectConstants.OBJECT_ID_USER,
      SimConnectPeriod.SIM_FRAME
    );
  }

  private registerEventHandlers(handle: SimConnectConnection, remote?: { host: string; port: number }): void {
    handle.subscribeToSystemEvent(EVENT_PAUSE, "Pause");

    handle.on("event", (recvEvent) => {
      if (recvEvent.clientEventId === EVENT_PAUSE) {
        this.paused = recvEvent.data !== 0;
      }
    });

    handle.on("simObjectData", (recvSimObjectData) => {
      if (recvSimObjectData.requestID !== REQUEST_LIVE_DATA) return;
      const d = recvSimObjectData.data;

      const sample: TelemetrySample = {
        timestamp: Date.now(),
        lat: d.readFloat64(),
        lon: d.readFloat64(),
        altMslFt: d.readFloat64(),
        altAglFt: d.readFloat64(),
        groundSpeedKt: d.readFloat64(),
        verticalSpeedFpm: d.readFloat64(),
        headingDeg: d.readFloat64(),
        onGround: d.readInt32() !== 0,
        fuelTotalKg: d.readFloat64(),
        simRate: d.readFloat64(),
        paused: this.paused,
        engine1Combustion: d.readInt32() !== 0,
        engine2Combustion: d.readInt32() !== 0,
        atcId: d.readString32().trim() || null,
      };

      this.sampleCbs.forEach((cb) => cb(sample));
    });

    const handleDrop = () => {
      this.handle = null;
      this.disconnectCbs.forEach((cb) => cb());
      this.scheduleReconnect(remote);
    };
    handle.on("close", handleDrop);
    handle.on("quit", handleDrop);
  }
}
