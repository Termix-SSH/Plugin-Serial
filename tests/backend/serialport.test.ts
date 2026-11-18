import { describe, expect, it } from "vitest";
import { setLibc } from "../../src/backend/serialport.js";

describe("setLibc", () => {
  it("picks glibc or musl on Linux without reading files", () => {
    const glibc: NodeJS.ProcessEnv = {};
    setLibc(glibc, "linux", () => "2.39");
    expect(glibc.LIBC).toBe("glibc");
    const musl: NodeJS.ProcessEnv = {};
    setLibc(musl, "linux", () => undefined);
    expect(musl.LIBC).toBe("musl");
  });

  it("keeps a set LIBC and skips other platforms", () => {
    const set: NodeJS.ProcessEnv = { LIBC: "musl" };
    setLibc(set, "linux", () => "2.39");
    expect(set.LIBC).toBe("musl");
    const win: NodeJS.ProcessEnv = {};
    setLibc(win, "win32", () => undefined);
    expect(win.LIBC).toBeUndefined();
  });
});
