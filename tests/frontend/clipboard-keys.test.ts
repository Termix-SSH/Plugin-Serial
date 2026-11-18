import { describe, expect, it, vi } from "vitest";
import { clipboardKeyHandler } from "../../src/frontend/clipboard-keys.js";

function setup(selection = "") {
  const terminal = {
    hasSelection: () => selection !== "",
    getSelection: () => selection,
    clearSelection: vi.fn(),
    paste: vi.fn(),
  };
  const clipboard = {
    writeText: vi.fn(async () => {}),
    readText: vi.fn(async () => "pasted"),
  };
  return {
    terminal,
    clipboard,
    handle: clipboardKeyHandler(terminal, clipboard),
  };
}

const key = (code: string, mods: Partial<KeyboardEvent> = {}) =>
  ({
    type: "keydown",
    code,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    altKey: false,
    ...mods,
  }) as KeyboardEvent;

describe("serial clipboard keys", () => {
  it("copies the selection with Ctrl+Shift+C or Cmd+C", () => {
    for (const mods of [{ ctrlKey: true, shiftKey: true }, { metaKey: true }]) {
      const { terminal, clipboard, handle } = setup("AT+OK");
      expect(handle(key("KeyC", mods))).toBe(false);
      expect(clipboard.writeText).toHaveBeenCalledWith("AT+OK");
      expect(terminal.clearSelection).toHaveBeenCalled();
    }
  });

  it("pastes with Ctrl+Shift+V", async () => {
    const { terminal, handle } = setup();
    expect(handle(key("KeyV", { ctrlKey: true, shiftKey: true }))).toBe(false);
    await vi.waitFor(() =>
      expect(terminal.paste).toHaveBeenCalledWith("pasted"),
    );
  });

  it("leaves Ctrl+C and plain keys to the device", () => {
    const { clipboard, handle } = setup("AT+OK");
    expect(handle(key("KeyC", { ctrlKey: true }))).toBe(true);
    expect(handle(key("KeyA"))).toBe(true);
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });
});
