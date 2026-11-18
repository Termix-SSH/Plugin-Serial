import { describe, expect, it } from "vitest";
import { checkFrameViews } from "@termix-ssh/plugin-sdk/testing";
import * as plugin from "../../src/frontend/index";
import manifest from "../../manifest.json";

describe("sandboxed frame views", () => {
  it("asks core only for what a frame may reach", async () => {
    const { refused } = await checkFrameViews(plugin, {
      manifest: manifest as unknown as Record<string, unknown>,
    });
    expect(refused).toEqual([]);
  });
});
