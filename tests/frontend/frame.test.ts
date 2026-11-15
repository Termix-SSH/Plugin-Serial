import { describe, expect, it } from "vitest";
import { checkFrameApp } from "@termix-ssh/plugin-sdk/testing";
import * as plugin from "../../src/frontend/index";
import manifest from "../../manifest.json";

describe("sandboxed frame", () => {
  it("registers nothing the shell can't take from a frame", async () => {
    const { problems, registrations } = await checkFrameApp(plugin, {
      manifest: manifest as unknown as Record<string, unknown>,
    });
    expect(problems).toEqual([]);
    expect(registrations.length).toBeGreaterThan(0);
  });
});
