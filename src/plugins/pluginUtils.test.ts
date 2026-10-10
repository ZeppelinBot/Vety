import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { z } from "zod";
import type { PluginPublicInterface } from "./pluginUtils.ts";
import { guildPluginContract } from "#/plugins/GuildPlugin";

type AssertEquals<TActual, TExpected> = TActual extends TExpected ? true : false;

describe("pluginUtils", () => {
  it("PluginPublicInterface type", () => {
    const myPlugin = guildPluginContract({ configSchema: z.strictObject({}) }).plugin({
      name: "my-plugin",
      public() {
        return {
          someFn: () => 5,
        };
      },
    });

    type PublicInterface = PluginPublicInterface<typeof myPlugin>;
    type Expected = { someFn: () => 5 };
    type NotExpected = { someFn: "foo" };

    /* oxlint-disable-next-line no-unused-vars */
    const result1: AssertEquals<Expected, PublicInterface> = true;
    /* oxlint-disable-next-line no-unused-vars */
    const result2: AssertEquals<NotExpected, PublicInterface> = false;

    // Type-only test
    assert.ok(true);
  });
});
