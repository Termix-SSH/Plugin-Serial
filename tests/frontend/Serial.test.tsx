import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const terminal = vi.hoisted(() => ({
  loadAddon: () => {},
  onData: () => ({ dispose: () => {} }),
  options: {},
  write: () => {},
  writeln: () => {},
  clear: () => {},
}));
vi.mock("react-xtermjs", () => ({
  useXTerm: () => ({ instance: terminal, ref: { current: null } }),
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));
vi.mock("@termix-ssh/plugin-sdk/frontend", () => ({
  invokeAction: vi.fn(async () => null),
  useTranslation: () => ({ t: (key: string) => key }),
  useTheme: () => ({ theme: "dark" }),
}));
vi.mock("@termix-ssh/plugin-sdk/ui", () => ({
  ConnectionScreen: (props: {
    status: string;
    disconnectedMessage?: string;
    onManualRetry?: () => void;
  }) => (
    <div data-status={props.status}>
      {props.status === "disconnected" && props.disconnectedMessage}
      <button onClick={props.onManualRetry}>retry</button>
    </div>
  ),
}));

import { Serial } from "../../src/frontend/Serial";
import { setSerialBridge } from "../../src/frontend/transport";

const config = {
  path: "",
  baudRate: 115200,
  dataBits: 8 as const,
  stopBits: 1 as const,
  parity: "none" as const,
};

afterEach(() => setSerialBridge(null));

describe("Serial over the shell's Web Serial bridge", () => {
  it("asks for a port only after a click in the tab", async () => {
    const write = vi.fn(async () => {});
    const request = vi.fn(async () => ({ write, close: async () => {} }));
    setSerialBridge({ available: true, request });
    render(<Serial config={config} isVisible instanceId="t1" />);
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByText("serial.choosePort")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText("retry"));
    });
    expect(request).toHaveBeenCalledWith(
      { baudRate: 115200, dataBits: 8, stopBits: 1, parity: "none" },
      expect.objectContaining({ onData: expect.any(Function) }),
    );
    expect(
      document.querySelector("[data-status]")?.getAttribute("data-status"),
    ).toBe("connected");
  });

  it("treats a refused or empty pick as disconnected", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("Not allowed now"))
      .mockResolvedValueOnce(null);
    setSerialBridge({ available: true, request });
    render(<Serial config={config} isVisible instanceId="t2" />);
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        fireEvent.click(screen.getByText("retry"));
      });
      expect(
        document.querySelector("[data-status]")?.getAttribute("data-status"),
      ).toBe("disconnected");
    }
  });
});
