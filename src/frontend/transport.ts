import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";

/**
 * The live app.wsUrl, for components that are defined at module scope rather
 * than inside activate(). Set on activate, cleared on dispose, the same
 * pattern the tunnels plugin uses for app.api.
 */
let wsUrl: TermixApp["wsUrl"] | null = null;

export function setSerialWsUrl(next: TermixApp["wsUrl"] | null): void {
  wsUrl = next;
}

/**
 * The console's WebSocket URL and auth subprotocols. No origin option: a
 * serial device is physically attached to this desktop machine, so it
 * always dials the embedded local backend rather than a connected remote
 * sync server (app.wsUrl's default when no origin is given).
 */
export async function resolveSerialWsUrl() {
  if (!wsUrl) return null;
  return wsUrl("/console");
}

/** The shell's Web Serial bridge (Termix 26.11.2, plugin API 2.8). */
export interface SerialBridge {
  readonly available: boolean;
  request: (
    options: {
      baudRate: number;
      dataBits?: 7 | 8;
      stopBits?: 1 | 2;
      parity?: "none" | "even" | "odd";
    },
    events: { onData: (chunk: Uint8Array) => void; onClose: () => void },
  ) => Promise<{
    write: (data: Uint8Array) => Promise<void>;
    close: () => Promise<void>;
  } | null>;
}

let bridge: SerialBridge | null = null;

export function setSerialBridge(next: SerialBridge | null): void {
  bridge = next;
}

/** The bridge, or null on a core or browser without Web Serial. */
export function serialBridge(): SerialBridge | null {
  return bridge?.available ? bridge : null;
}
