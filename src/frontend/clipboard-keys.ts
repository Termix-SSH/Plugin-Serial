import type { Terminal } from "@xterm/xterm";

type ClipboardTerminal = Pick<
  Terminal,
  "hasSelection" | "getSelection" | "clearSelection" | "paste"
>;
type TextClipboard = Pick<Clipboard, "readText" | "writeText">;

/**
 * Ctrl+Shift+C / Ctrl+Shift+V (Cmd+C / Cmd+V on macOS) copy and paste, as in
 * the SSH terminal; every other key goes to the port. Without this nothing
 * reaches the clipboard in the desktop app, since Ctrl+C is the device's.
 */
export function clipboardKeyHandler(
  terminal: ClipboardTerminal,
  clipboard: TextClipboard = navigator.clipboard,
): (event: KeyboardEvent) => boolean {
  return (event) => {
    const shortcut =
      event.type === "keydown" &&
      !event.altKey &&
      (event.metaKey || (event.ctrlKey && event.shiftKey));
    if (!shortcut) return true;
    if (event.code === "KeyC") {
      if (terminal.hasSelection()) {
        void clipboard.writeText(terminal.getSelection());
        terminal.clearSelection();
      }
      return false;
    }
    if (event.code === "KeyV") {
      void clipboard.readText().then((text) => {
        if (text) terminal.paste(text);
      });
      return false;
    }
    return true;
  };
}
