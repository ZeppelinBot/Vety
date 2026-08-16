import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import type { Channel, GuildChannel, GuildTextBasedChannel, Message, TextBasedChannel } from "discord.js";
import type { BasePluginType } from "../plugins/pluginTypes.ts";
import type { GuildMessage } from "../types.ts";
import { globalPluginEventListener, guildPluginEventListener } from "./EventListenerBlueprint.ts";

type AssertEquals<TActual, TExpected> = TActual extends TExpected ? true : false;

describe("guildPluginEventListener() helper", () => {
  it("(blueprint)", () => {
    const blueprint1 = guildPluginEventListener({
      event: "messageCreate",
      listener() {},
    });

    assert.strictEqual(blueprint1.event, "messageCreate");
    assert.notStrictEqual(blueprint1.listener, undefined);
    assert.strictEqual(blueprint1.allowSelf, undefined);
  });

  it("(blueprint) guild event argument inference", () => {
    guildPluginEventListener({
      event: "messageCreate",
      listener({ args }) {
        // Test type inference
        /* oxlint-disable-next-line no-unused-vars */
        const result: AssertEquals<typeof args, { message: GuildMessage }> = true;
      },
    });

    // More type checks
    guildPluginEventListener({
      event: "channelUpdate",
      listener({ args }) {
        // Test type inference
        /* oxlint-disable-next-line no-unused-vars */
        const result: AssertEquals<typeof args, { oldChannel: GuildChannel; newChannel: GuildChannel }> = true;
      },
    });

    guildPluginEventListener({
      event: "typingStart",
      listener({ args }) {
        // Test type inference
        /* oxlint-disable-next-line no-unused-vars */
        const result: AssertEquals<typeof args.typing.channel, GuildTextBasedChannel> = true;
      },
    });
  });

  interface CustomPluginType extends BasePluginType {
    config: {
      foo: 5;
    };
  }

  it("<TPluginType>()(blueprint)", () => {
    const blueprint = guildPluginEventListener<CustomPluginType>()({
      event: "messageCreate",
      listener() {},
    });

    assert.strictEqual(blueprint.event, "messageCreate");
    assert.notStrictEqual(blueprint.listener, undefined);
    assert.strictEqual(blueprint.allowSelf, undefined);
  });
});

describe("globalPluginEventListener() helper", () => {
  it("(blueprint)", () => {
    const blueprint = globalPluginEventListener({
      event: "messageCreate",
      listener() {},
    });

    assert.strictEqual(blueprint.event, "messageCreate");
    assert.notStrictEqual(blueprint.listener, undefined);
    assert.strictEqual(blueprint.allowSelf, undefined);
  });

  it("(blueprint) guild event argument inference", () => {
    globalPluginEventListener({
      event: "messageCreate",
      listener({ args }) {
        // Test type inference
        /* oxlint-disable-next-line no-unused-vars */
        const result: AssertEquals<typeof args, { message: Message }> = true;
      },
    });

    // More type checks
    globalPluginEventListener({
      event: "channelUpdate",
      listener({ args }) {
        // Test type inference
        /* oxlint-disable-next-line no-unused-vars */
        const result: AssertEquals<typeof args, { oldChannel: Channel; newChannel: Channel }> = true;
      },
    });

    globalPluginEventListener({
      event: "typingStart",
      listener({ args }) {
        // Test type inference
        /* oxlint-disable-next-line no-unused-vars */
        const result: AssertEquals<typeof args.typing.channel, TextBasedChannel> = true;
      },
    });
  });

  interface CustomPluginType extends BasePluginType {
    config: {
      foo: 5;
    };
  }

  it("<TPluginType>()(blueprint)", () => {
    const blueprint = globalPluginEventListener<CustomPluginType>()({
      event: "messageCreate",
      listener() {},
    });

    assert.strictEqual(blueprint.event, "messageCreate");
    assert.notStrictEqual(blueprint.listener, undefined);
    assert.strictEqual(blueprint.allowSelf, undefined);
  });
});
