import { assert, expect } from "chai";
import type { Client } from "discord.js";
import { describe, it } from "mocha";
import z from "zod/v4";
import { guildPluginMessageCommand } from "./commands/messageCommands/messageCommandBlueprint.ts";
import { guildPlugin } from "./plugins/PluginBlueprint.ts";
import {
  createMockGuild,
  createMockMember,
  createMockMessage,
  createMockTextChannel,
  createMockUser,
  initializeVety,
  sleep,
  withVety,
} from "./testUtils.ts";
import { noop } from "./utils.ts";

describe("Vety", () => {
  it("Multiple GUILD_CREATE events load guild's plugins only once", (mochaDone) => {
    withVety(mochaDone, async (createVety, done) => {
      let loadedTimes = 0;

      const PluginToLoad = guildPlugin({
        name: "plugin-to-load",
        configSchema: z.strictObject({}),

        afterLoad() {
          loadedTimes++;
        },

        afterUnload() {
          loadedTimes--;
        },
      });

      const vety = createVety({
        guildPlugins: [PluginToLoad],
        options: {
          autoRegisterApplicationCommands: false,
          getEnabledGuildPlugins() {
            return ["plugin-to-load"];
          },
          logFn: noop,
        },
      });
      await initializeVety(vety);

      const guild = createMockGuild(vety.client);
      vety.client.ws.emit("GUILD_CREATE", guild);
      await sleep(10);
      vety.client.ws.emit("GUILD_CREATE", guild);
      await sleep(10);
      vety.client.ws.emit("GUILD_CREATE", guild);
      vety.client.ws.emit("GUILD_CREATE", guild);
      vety.client.ws.emit("GUILD_CREATE", guild);
      await sleep(10);
      assert.strictEqual(loadedTimes, 1);

      done();
    });
  });

  it("GUILD_CREATE followed by ready event load guild's plugins only once", (mochaDone) => {
    withVety(mochaDone, async (createVety, done) => {
      let loadedTimes = 0;

      const PluginToLoad = guildPlugin({
        name: "plugin-to-load",
        configSchema: z.strictObject({}),

        afterLoad() {
          loadedTimes++;
        },

        afterUnload() {
          loadedTimes--;
        },
      });

      const vety = createVety({
        guildPlugins: [PluginToLoad],
        options: {
          autoRegisterApplicationCommands: false,
          getEnabledGuildPlugins() {
            return ["plugin-to-load"];
          },
          logFn: noop,
        },
      });
      await initializeVety(vety);

      const guild = createMockGuild(vety.client);
      vety.client.ws.emit("GUILD_CREATE", guild);
      await sleep(30);
      vety.client.emit("ready", vety.client as Client<true>);
      await sleep(30);
      assert(loadedTimes === 1);

      done();
    });
  });

  it("Errors during plugin loading unloads guild", (mochaDone) => {
    withVety(mochaDone, async (createVety, done) => {
      let loadedTimes = 0;

      const Plugin1 = guildPlugin({
        name: "plugin1",
        configSchema: z.strictObject({}),

        beforeLoad() {
          loadedTimes++;
        },

        beforeUnload() {
          loadedTimes--;
        },
      });

      const PluginWithError = guildPlugin({
        name: "plugin-with-error",
        configSchema: z.strictObject({}),

        beforeStart() {
          throw new Error("Foo");
        },
      });

      const vety = createVety({
        guildPlugins: [Plugin1, PluginWithError],
        options: {
          autoRegisterApplicationCommands: false,
          getEnabledGuildPlugins() {
            return ["plugin1", "plugin-with-error"];
          },
          logFn: noop,
        },
      });
      vety.on("error", () => {});

      const guild = createMockGuild(vety.client);

      await initializeVety(vety);

      vety.client.ws.emit("GUILD_CREATE", guild);
      await sleep(10);
      vety.client.ws.emit("GUILD_CREATE", guild);
      await sleep(10);
      vety.client.ws.emit("GUILD_CREATE", guild);
      vety.client.ws.emit("GUILD_CREATE", guild);
      vety.client.ws.emit("GUILD_CREATE", guild);
      await sleep(10);

      expect(vety.getLoadedGuild(guild.id)).to.equal(undefined);
      expect(loadedTimes).to.equal(0);

      done();
    });
  });

  it("concurrentGuildLoadLimit", (mochaDone) => {
    withVety(mochaDone, async (createVety, done) => {
      const concurrentGuildLoadLimit = 10;
      const loadTimeMs = 40;
      let loadedTimes = 0;

      const PluginToLoad = guildPlugin({
        name: "plugin-to-load",
        configSchema: z.strictObject({}),

        async beforeLoad() {
          await sleep(loadTimeMs);
        },

        afterLoad() {
          loadedTimes++;
        },
      });

      const vety = createVety({
        guildPlugins: [PluginToLoad],
        options: {
          autoRegisterApplicationCommands: false,
          getEnabledGuildPlugins() {
            return ["plugin-to-load"];
          },
          logFn: noop,
          concurrentGuildLoadLimit,
        },
      });
      await initializeVety(vety);

      for (let i = 0; i < concurrentGuildLoadLimit * 2; i++) {
        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      }
      await sleep(loadTimeMs + 5);
      assert.equal(loadedTimes, concurrentGuildLoadLimit);
      await sleep(loadTimeMs + 5);
      assert.equal(loadedTimes, concurrentGuildLoadLimit * 2);

      done();
    });
  });

  it("dispatchMessageCommands runs commands once and skips default handlers", (mochaDone) => {
    withVety(mochaDone, async (createVety, done) => {
      let runCount = 0;

      const DispatcherPlugin = guildPlugin({
        name: "dispatcher",
        configSchema: z.strictObject({}),
        messageCommands: [
          guildPluginMessageCommand({
            trigger: "foo",
            permission: null,
            run() {
              runCount += 1;
            },
          }),
        ],
      });

      const vety = createVety({
        guildPlugins: [DispatcherPlugin],
        options: {
          autoRegisterApplicationCommands: false,
          getEnabledGuildPlugins() {
            return ["dispatcher"];
          },
          getConfig() {
            return { prefix: "!", levels: {} };
          },
        },
      });
      await initializeVety(vety);

      const guild = createMockGuild(vety.client);
      vety.client.ws.emit("GUILD_CREATE", guild);
      await sleep(10);

      const channel = createMockTextChannel(vety.client, guild.id);
      const user = createMockUser(vety.client);
      createMockMember(guild, user);

      const message = createMockMessage(vety.client, channel, user, {
        content: "!foo",
        guild_id: guild.id,
        member: {
          user: {
            id: user.id,
          },
          roles: [],
        },
      });

      await vety.dispatchMessageCommands(message as any);
      expect(runCount).to.equal(1);

      vety.client.emit("messageCreate", message);
      expect(runCount).to.equal(1);

      done();
    });
  });

  it("Unloading a guild waits for running event listeners to finish", (mochaDone) => {
    withVety(mochaDone, async (createVety, done) => {
      let listenerDone = false;
      const Plugin = guildPlugin({
        name: "plugin",
        configSchema: z.strictObject({}),
        events: [
          {
            event: "messageCreate",
            async listener() {
              await sleep(50);
              listenerDone = true;
            },
          },
        ],
      });

      const vety = createVety({
        guildPlugins: [Plugin],
        options: {
          autoRegisterApplicationCommands: false,
          getEnabledGuildPlugins() {
            return ["plugin"];
          },
          logFn: noop,
        },
      });
      await initializeVety(vety);

      const guild = createMockGuild(vety.client);
      const channel = createMockTextChannel(vety.client, guild.id);
      const message = createMockMessage(vety.client, channel, createMockUser(vety.client));

      await vety.loadGuild(guild.id);
      vety.client.emit("messageCreate", message);
      await vety.unloadGuild(guild.id);

      assert.isTrue(listenerDone);

      done();
    });
  });

  it("Unloading a guild deals with event registration race conditions", (mochaDone) => {
    withVety(mochaDone, async (createVety, done) => {
      let cnt = 1;
      const Plugin = guildPlugin({
        name: "plugin",
        configSchema: z.strictObject({}),
        events: [
          {
            event: "messageCreate",
            async listener({ pluginData }) {
              cnt++;
              await sleep(50);
              pluginData.events.on("channelCreate", () => {
                cnt++;
              });
              // The following should not cause the above listener to run after unload
              vety.client.emit("channelCreate", channel);
            },
          },
        ],
      });

      const vety = createVety({
        guildPlugins: [Plugin],
        options: {
          autoRegisterApplicationCommands: false,
          getEnabledGuildPlugins() {
            return ["plugin"];
          },
          logFn: noop,
        },
      });
      await initializeVety(vety);

      const guild = createMockGuild(vety.client);
      const channel = createMockTextChannel(vety.client, guild.id);
      const message = createMockMessage(vety.client, channel, createMockUser(vety.client));

      await vety.loadGuild(guild.id);
      vety.client.emit("messageCreate", message);
      await vety.unloadGuild(guild.id);

      assert.equal(cnt, 2);

      done();
    });
  });
});
