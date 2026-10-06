import {
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useState,
} from "react";
import { useXTerm } from "react-xtermjs";
import { FitAddon } from "@xterm/addon-fit";
import {
  ConnectionScreen,
  type ConnectionStatus,
} from "@termix-ssh/plugin-sdk/ui";
import {
  invokeAction,
  useTranslation,
  useTheme,
} from "@termix-ssh/plugin-sdk/frontend";
import type { SerialConfig, SerialHandle } from "./types.js";
import { isElectron } from "./electron.js";
import { resolveSerialWsUrl } from "./transport.js";

interface SerialLook {
  colors: Record<string, string | undefined>;
  fontFamily: string;
  fontSize: number;
}

const FALLBACK_COLORS = {
  background: "#0c0d0b",
  foreground: "#fafafa",
  cursor: "#fafafa",
  cursorAccent: "#0c0d0b",
};
const FALLBACK_FONT = '"SF Mono", Consolas, "Liberation Mono", monospace';

type WebSerialPort = {
  open(options: {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: string;
  }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
};

interface SerialProps {
  config: SerialConfig;
  isVisible: boolean;
  instanceId: string;
}

export const Serial = forwardRef<SerialHandle, SerialProps>(function Serial(
  { config, isVisible, instanceId },
  ref,
) {
  const { t } = useTranslation();
  const { theme: appTheme } = useTheme();
  const { instance: terminal, ref: xtermRef } = useXTerm();
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [failure, setFailure] = useState<string | null>(null);
  const fail = useCallback((reason: string) => {
    setFailure(reason || null);
    setStatus("error");
  }, []);
  const connectedRef = useRef(false);
  const webSerialReaderRef = useRef<ReadableStreamDefaultReader | null>(null);
  const webSerialWriterRef = useRef<WritableStreamDefaultWriter | null>(null);
  const webSerialPortRef = useRef<WebSerialPort | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const useWebSerial = !isElectron();

  const write = useCallback(
    (text: string) => {
      terminal?.write(text);
    },
    [terminal],
  );

  useEffect(() => {
    if (!terminal) return;
    let active = true;
    terminal.options.theme = { ...FALLBACK_COLORS };
    terminal.options.fontFamily = FALLBACK_FONT;
    terminal.options.fontSize = 14;
    // The user's terminal look from the SSH terminal, when it is running.
    void invokeAction("terminal.resolveTheme", { appTheme })
      .then((look) => {
        const resolved = look as SerialLook | undefined;
        if (!active || !resolved) return;
        terminal.options.theme = { ...resolved.colors };
        terminal.options.fontFamily = resolved.fontFamily;
        terminal.options.fontSize = resolved.fontSize;
        fitAddonRef.current?.fit();
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [terminal, appTheme]);

  // ── WebSocket (Electron) path ──────────────────────────────────────────

  const disconnectWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    connectedRef.current = false;
  }, []);

  const connectWs = useCallback(async () => {
    disconnectWs();
    const target = await resolveSerialWsUrl();
    if (!target) {
      fail(t("serial.errorNoServerUrl"));
      return;
    }

    setStatus("connecting");
    setFailure(null);
    const ws = new WebSocket(target.url, target.protocols);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "connect", data: config }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as {
          type: string;
          data?: unknown;
        };
        switch (msg.type) {
          case "connected":
            connectedRef.current = true;
            setStatus("connected");
            break;
          case "data":
            if (typeof msg.data === "string") write(msg.data);
            break;
          case "disconnected":
            connectedRef.current = false;
            setStatus("disconnected");
            break;
          case "error":
            fail(String(msg.data ?? ""));
            break;
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      connectedRef.current = false;
    };

    ws.onerror = () => {
      fail(t("serial.wsError"));
    };
  }, [config, disconnectWs, fail, t, write]);

  // ── Web Serial API path ────────────────────────────────────────────────

  const disconnectWebSerial = useCallback(async () => {
    try {
      webSerialReaderRef.current?.cancel();
      webSerialWriterRef.current?.releaseLock();
      await webSerialPortRef.current?.close();
    } catch {
      // best-effort
    }
    webSerialReaderRef.current = null;
    webSerialWriterRef.current = null;
    webSerialPortRef.current = null;
    connectedRef.current = false;
  }, []);

  const connectWebSerial = useCallback(async () => {
    await disconnectWebSerial();

    if (!("serial" in navigator)) return;

    setStatus("connecting");
    setFailure(null);
    try {
      const serial = navigator.serial as {
        requestPort(): Promise<WebSerialPort>;
      };
      const port = await serial.requestPort();
      await port.open({
        baudRate: config.baudRate,
        dataBits: config.dataBits,
        stopBits: config.stopBits,
        parity: config.parity === "none" ? "none" : config.parity,
      });

      webSerialPortRef.current = port;
      connectedRef.current = true;
      setStatus("connected");

      const reader = port.readable!.getReader();
      webSerialReaderRef.current = reader;
      const decoder = new TextDecoder();

      (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            write(decoder.decode(value));
          }
        } catch {
          // port closed
        } finally {
          reader.releaseLock();
          connectedRef.current = false;
          setStatus("disconnected");
        }
      })();

      const writer = port.writable!.getWriter();
      webSerialWriterRef.current = writer;
    } catch (err) {
      // No port picked counts as a plain disconnect, not a failure.
      if (err instanceof Error && err.name !== "NotFoundError") {
        fail(err.message);
      } else {
        setStatus("disconnected");
      }
    }
  }, [config, disconnectWebSerial, fail, write]);

  // ── Unified connect/disconnect ─────────────────────────────────────────

  const connect = useCallback(() => {
    if (useWebSerial) {
      connectWebSerial();
    } else {
      void connectWs();
    }
  }, [useWebSerial, connectWebSerial, connectWs]);

  const disconnect = useCallback(() => {
    if (useWebSerial) {
      disconnectWebSerial();
    } else {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "disconnect" }));
      }
      disconnectWs();
    }
  }, [useWebSerial, disconnectWebSerial, disconnectWs]);

  const reconnect = useCallback(() => {
    disconnect();
    connect();
  }, [disconnect, connect]);

  useImperativeHandle(ref, () => ({
    connect,
    disconnect,
    reconnect,
    isConnected: () => connectedRef.current,
    sendInput: (data: string) => {
      if (useWebSerial) {
        const encoder = new TextEncoder();
        webSerialWriterRef.current?.write(encoder.encode(data)).catch(() => {});
      } else if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data }));
      }
    },
  }));

  // ── Terminal setup ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!terminal) return;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);
    terminal.options.cursorBlink = true;
    terminal.options.scrollback = 10000;

    terminal.onData((data) => {
      if (!connectedRef.current) return;
      if (useWebSerial) {
        const encoder = new TextEncoder();
        webSerialWriterRef.current?.write(encoder.encode(data)).catch(() => {});
      } else if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data }));
      }
    });

    connect();

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal, instanceId]);

  // ── Fit on visibility change ───────────────────────────────────────────

  useEffect(() => {
    if (!isVisible || !fitAddonRef.current) return;
    try {
      fitAddonRef.current.fit();
    } catch {
      // ignore
    }
  }, [isVisible]);

  // ── ResizeObserver ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || !terminal) return;
    const observer = new ResizeObserver(() => {
      try {
        fitAddonRef.current?.fit();
      } catch {
        // ignore
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [terminal]);

  // ── Not supported (Firefox etc.) ──────────────────────────────────────

  if (useWebSerial && !("serial" in navigator)) {
    return (
      <div className="relative flex h-full w-full">
        <ConnectionScreen
          status="error"
          unavailable={{
            title: t("serial.notSupportedTitle"),
            hint: t("serial.notSupported"),
          }}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex h-full w-full">
      <div ref={xtermRef} className="flex-1 min-h-0" />
      <ConnectionScreen
        status={status}
        message={t("serial.opening", {
          path: config.path || t("serial.title"),
        })}
        detail={t("serial.baudDetail", { baud: config.baudRate })}
        errorDetail={failure}
        disconnectedMessage={t("serial.disconnected")}
        onManualRetry={reconnect}
      />
    </div>
  );
});
