import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import type { AssertTypeEquals } from "../../testUtils.ts";
import { slashOptions } from "./slashCommandOptions.ts";
import type { OptionsFromSignature, SlashCommandSignature } from "./slashCommandUtils.ts";

describe("slashCommandUtils", () => {
  it("OptionsFromSignature basic functionality", () => {
    const signature = [
      slashOptions.string({ name: "required_str", description: "", required: true }),
      slashOptions.string({ name: "optional_str", description: "" }),
    ] satisfies SlashCommandSignature;

    /* oxlint-disable-next-line no-unused-vars */
    const test1: AssertTypeEquals<OptionsFromSignature<typeof signature>["required_str"], string> = true;
    /* oxlint-disable-next-line no-unused-vars */
    const test2: AssertTypeEquals<OptionsFromSignature<typeof signature>["required_str"], null> = false;

    /* oxlint-disable-next-line no-unused-vars */
    const test3: AssertTypeEquals<OptionsFromSignature<typeof signature>["optional_str"], string> = true;
    /* oxlint-disable-next-line no-unused-vars */
    const test4: AssertTypeEquals<OptionsFromSignature<typeof signature>["optional_str"], null> = true;

    // Type-only test
    assert.ok(true);
  });
});
