import { BrowserWindow, ipcMain } from "electron";
import { TelemetrySample, TelemetrySource, ConnectionStatus } from "../shared/telemetry-types";
import { SimConnectTelemetrySource } from "../telemetry/SimConnectTelemetrySource";
import { MockTelemetrySource } from "../telemetry/MockTelemetrySource";

/**
 * Owns whichever TelemetrySource is active and forwards every sample (plus
 * connection status changes) to the renderer over IPC. Firebase never runs
 * in this process — only the renderer touches Firestore.
 */
export class TelemetryService {
  private source: TelemetrySource | null = null;
  private status: ConnectionStatus = "disconnected";
  private window: BrowserWindow;

  constructor(window: BrowserWindow) {
    this.window = window;
    ipcMain.handle("telemetry:connect", (_e, mode: "simconnect" | "mock") => this.start(mode));
    ipcMain.handle("telemetry:disconnect", () => this.stop());
    ipcMain.handle("telemetry:status", () => this.status);
  }

  private async start(mode: "simconnect" | "mock"): Promise<void> {
    this.stop();
    this.source = mode === "mock" ? new MockTelemetrySource() : new SimConnectTelemetrySource();

    this.setStatus("connecting");
    this.source.onSample((sample) => this.broadcastSample(sample));
    this.source.onDisconnect(() => this.setStatus("disconnected"));

    try {
      await this.source.connect();
      this.setStatus("connected");
    } catch {
      this.setStatus("error");
    }
  }

  private stop(): void {
    this.source?.disconnect();
    this.source = null;
    this.setStatus("disconnected");
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.window.webContents.send("telemetry:status-changed", status);
  }

  private broadcastSample(sample: TelemetrySample): void {
    this.window.webContents.send("telemetry:tick", sample);
  }
}
