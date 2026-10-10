import type { MessageContextMenuCommandBlueprint, UserContextMenuCommandBlueprint } from "#/commands/contextMenuCommands/contextMenuCommandBlueprint";
import type { MessageContextMenuCommandInteraction, UserContextMenuCommandInteraction } from "discord.js";
import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

type AssertEquals<TActual, TExpected> = TActual extends TExpected ? true : false;

describe("Context menu command blueprints", () => {
  it("MessageContextMenuCommandBlueprint", () => {
    const command: MessageContextMenuCommandBlueprint<any> = {
      type: "message-context-menu",
      name: "Test command",
      run({ interaction }) {
        /* oxlint-disable-next-line no-unused-vars */
        const typeCheck: AssertEquals<typeof interaction, MessageContextMenuCommandInteraction> = true;
      },
    };

    // Type-only test
    assert.ok(true);
  });

  it("UserContextMenuCommandBlueprint", () => {
    const command: UserContextMenuCommandBlueprint<any> = {
      type: "user-context-menu",
      name: "Test command",
      run({ interaction }) {
        /* oxlint-disable-next-line no-unused-vars */
        const typeCheck: AssertEquals<typeof interaction, UserContextMenuCommandInteraction> = true;
      },
    };

    // Type-only test
    assert.ok(true);
  });
});
