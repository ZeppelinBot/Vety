import type { MessageContextMenuCommandInteraction, UserContextMenuCommandInteraction } from "discord.js";
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import type { BasePluginType } from "../../plugins/pluginTypes.ts";
import {
  globalPluginMessageContextMenuCommand,
  globalPluginUserContextMenuCommand,
  guildPluginMessageContextMenuCommand,
  guildPluginUserContextMenuCommand,
} from "./contextMenuCommandBlueprint.ts";

type AssertEquals<TActual, TExpected> = TActual extends TExpected ? true : false;

describe("Context menu command blueprints", () => {
  describe("MessageContextMenuCommandBlueprint", () => {
    it("(blueprint)", () => {
      guildPluginMessageContextMenuCommand({
        name: "Test command",
        run({ interaction }) {
          /* oxlint-disable-next-line no-unused-vars */
          const result: AssertEquals<typeof interaction, MessageContextMenuCommandInteraction> = true;
        },
      });

      globalPluginMessageContextMenuCommand({
        name: "Test command",
        run({ interaction }) {
          /* oxlint-disable-next-line no-unused-vars */
          const result: AssertEquals<typeof interaction, MessageContextMenuCommandInteraction> = true;
        },
      });

      // Type-only test
      assert.ok(true);
    });

    interface CustomPluginType extends BasePluginType {
      state: {
        foo: 5;
      };
    }

    it("<TPluginData>()(blueprint)", () => {
      guildPluginMessageContextMenuCommand<CustomPluginType>()({
        name: "Test command",
        run({ pluginData, interaction }) {
          /* oxlint-disable-next-line no-unused-vars */
          const result1: AssertEquals<typeof interaction, MessageContextMenuCommandInteraction> = true;
          /* oxlint-disable-next-line no-unused-vars */
          const result2: AssertEquals<typeof pluginData.state.foo, number> = true;
        },
      });

      globalPluginMessageContextMenuCommand<CustomPluginType>()({
        name: "Test command",
        run({ pluginData, interaction }) {
          /* oxlint-disable-next-line no-unused-vars */
          const result1: AssertEquals<typeof interaction, MessageContextMenuCommandInteraction> = true;
          /* oxlint-disable-next-line no-unused-vars */
          const result2: AssertEquals<typeof pluginData.state.foo, number> = true;
        },
      });

      // Type-only test
      assert.ok(true);
    });
  });

  describe("UserContextMenuCommandBlueprint", () => {
    it("(blueprint)", () => {
      guildPluginUserContextMenuCommand({
        name: "Test command",
        run({ interaction }) {
          /* oxlint-disable-next-line no-unused-vars */
          const result: AssertEquals<typeof interaction, UserContextMenuCommandInteraction> = true;
        },
      });

      guildPluginUserContextMenuCommand({
        name: "Test command",
        run({ interaction }) {
          /* oxlint-disable-next-line no-unused-vars */
          const result: AssertEquals<typeof interaction, UserContextMenuCommandInteraction> = true;
        },
      });

      // Type-only test
      assert.ok(true);
    });

    interface CustomPluginType extends BasePluginType {
      state: {
        foo: 5;
      };
    }

    it("<TPluginData>()(blueprint)", () => {
      guildPluginUserContextMenuCommand<CustomPluginType>()({
        name: "Test command",
        run({ pluginData, interaction }) {
          /* oxlint-disable-next-line no-unused-vars */
          const result1: AssertEquals<typeof interaction, UserContextMenuCommandInteraction> = true;
          /* oxlint-disable-next-line no-unused-vars */
          const result2: AssertEquals<typeof pluginData.state.foo, number> = true;
        },
      });

      globalPluginUserContextMenuCommand<CustomPluginType>()({
        name: "Test command",
        run({ pluginData, interaction }) {
          /* oxlint-disable-next-line no-unused-vars */
          const result1: AssertEquals<typeof interaction, UserContextMenuCommandInteraction> = true;
          /* oxlint-disable-next-line no-unused-vars */
          const result2: AssertEquals<typeof pluginData.state.foo, number> = true;
        },
      });

      // Type-only test
      assert.ok(true);
    });
  });
});
