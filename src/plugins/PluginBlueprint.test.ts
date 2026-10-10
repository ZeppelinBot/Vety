import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import type { ChatInputCommandInteraction, TextChannel } from "discord.js";
import { parseSignature } from "knub-command-manager";
import z from "zod";
import { PluginContextMenuCommandManager } from "../commands/contextMenuCommands/PluginContextMenuCommandManager.ts";
import { PluginMessageCommandManager } from "../commands/messageCommands/PluginMessageCommandManager.ts";
import { PluginSlashCommandManager } from "../commands/slashCommands/PluginSlashCommandManager.ts";
import { PluginConfigManager } from "../config/PluginConfigManager.ts";
import { GlobalPluginEventManager } from "../events/GlobalPluginEventManager.ts";
import { GuildPluginEventManager } from "../events/GuildPluginEventManager.ts";
import {
  assertTypeEquals,
  createMockClient,
  createMockGuild,
  createMockMember,
  createMockMessage,
  createMockRole,
  createMockTextChannel,
  createMockUser,
  initializeVety,
  sleep,
  withVety,
} from "../testUtils.ts";
import { noop } from "../utils.ts";
import { type GuildPluginData, isGlobalPluginData } from "./PluginData.ts";
import type { AnyPluginType } from "./pluginType.ts";
import { guildPluginContract, type GuildPluginBlueprint } from "#/plugins/GuildPlugin";
import { globalPluginContract } from "#/plugins/GlobalPlugin";
import { slashOptions } from "#/commands/slashCommands/slashCommandOptions";
import type { AnyPluginBlueprint } from "#/plugins/PluginBlueprint";
import { CooldownManager } from "#/cooldowns/CooldownManager";
import { LockManager } from "#/locks/LockManager";

type AssertEquals<TActual, TExpected> = TActual extends TExpected ? true : false;

describe("PluginBlueprint", () => {
  const emptyGuildPluginContract = guildPluginContract({ configSchema: z.strictObject({}) });
  const emptyGlobalPluginContract = globalPluginContract({ configSchema: z.strictObject({}) });

  describe("Commands and events", () => {
    it("loads commands and events", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToLoad = emptyGuildPluginContract.plugin({
          name: "plugin-to-load",

          messageCommands: [emptyGuildPluginContract.messageCommand({ trigger: "foo", permission: null, run: noop })],
          slashCommands: [
            emptyGuildPluginContract.slashCommand({ name: "bar", description: "", signature: [], run: noop }),
          ],
          contextMenuCommands: [emptyGuildPluginContract.messageContextMenuCommand({ name: "baz", run: noop })],
          events: [emptyGuildPluginContract.eventListener({ event: "messageCreate", listener: noop })],

          afterLoad(pluginData) {
            assert.strictEqual(pluginData.messageCommands.getAll().length, 1);
            assert.strictEqual(pluginData.slashCommands.getAll().length, 1);
            assert.strictEqual(pluginData.contextMenuCommands.getAll().length, 1);
            // There are also default message and interaction listeners that are always registered, hence 4
            assert.strictEqual(pluginData.events.getListenerCount(), 4);

            done();
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
      });
    });

    it("guild events are only passed to the matching guild", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToLoad = emptyGuildPluginContract.plugin({
          name: "plugin-to-load",

          events: [
            emptyGuildPluginContract.eventListener({
              event: "messageCreate",
              listener({ pluginData, args }) {
                assert.strictEqual(pluginData.guild.id, args.message.channel.guild.id);
                guildCounts[pluginData.guild.id]++;
              },
            }),
          ],
        });

        const vety = createVety({
          guildPlugins: [PluginToLoad],
          options: {
            getEnabledGuildPlugins() {
              return ["plugin-to-load"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild0 = createMockGuild(vety.client);
        const guild1 = createMockGuild(vety.client);

        const guildCounts = {
          [guild0.id]: 0,
          [guild1.id]: 0,
        };

        vety.client.ws.emit("GUILD_CREATE", guild0);
        vety.client.ws.emit("GUILD_CREATE", guild1);
        await sleep(30);

        const user0 = createMockUser(vety.client);
        const user1 = createMockUser(vety.client);
        const guild0Channel = createMockTextChannel(vety.client, guild0.id);
        const guild1Channel = createMockTextChannel(vety.client, guild1.id);

        const guild0Message1 = createMockMessage(vety.client, guild0Channel, user0, { content: "foo" });
        const guild0Message2 = createMockMessage(vety.client, guild0Channel, user0, { content: "bar" });
        const guild1Message1 = createMockMessage(vety.client, guild1Channel, user1, { content: "foo" });
        const guild1Message2 = createMockMessage(vety.client, guild1Channel, user1, { content: "bar" });

        vety.client.emit("messageCreate", guild0Message1);
        vety.client.emit("messageCreate", guild0Message2);
        vety.client.emit("messageCreate", guild1Message1);
        vety.client.emit("messageCreate", guild1Message2);
        await sleep(30);

        assert.strictEqual(guildCounts[guild0.id], 2);
        assert.strictEqual(guildCounts[guild1.id], 2);
        done();
      });
    });

    it("global events are not passed to guild event listeners", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToLoad = emptyGuildPluginContract.plugin({
          name: "plugin-to-load",

          events: [
            emptyGuildPluginContract.eventListener({
              // @ts-expect-error: "userUpdate" is not a valid guild event
              event: "userUpdate",
              listener() {
                assert.fail("userUpdate was called in a guild event listener");
              },
            }),
          ],
        });

        const client = createMockClient();
        const vety = createVety({
          guildPlugins: [PluginToLoad],
          options: {
            getEnabledGuildPlugins() {
              return ["plugin-to-load"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild0 = createMockGuild(client);
        client.ws.emit("GUILD_CREATE", guild0);
        await sleep(30);

        const user = createMockUser(client);
        client.emit("userUpdate", user, user);
        await sleep(10);

        done();
      });
    });

    it("global events are passed to global event listeners", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToLoad = emptyGlobalPluginContract.plugin({
          name: "plugin-to-load",

          events: [
            emptyGlobalPluginContract.eventListener({
              event: "userUpdate",
              listener() {
                done();
              },
            }),
          ],
        });

        const vety = createVety({
          globalPlugins: [PluginToLoad],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const user = createMockUser(vety.client);
        vety.client.emit("userUpdate", user, user);
      });
    });

    it("guild events are passed to global event listeners", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToLoad = emptyGlobalPluginContract.plugin({
          name: "plugin-to-load",

          events: [
            emptyGlobalPluginContract.eventListener({
              event: "messageCreate",
              listener({ pluginData, args }) {
                assert.ok(isGlobalPluginData(pluginData));
                assert.strictEqual((args.message.channel as TextChannel).guild.id, guild.id);
                done();
              },
            }),
          ],
        });

        const vety = createVety({
          globalPlugins: [PluginToLoad],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);

        const user = createMockUser(vety.client);
        const channel = createMockTextChannel(vety.client, guild.id);
        const message = createMockMessage(vety.client, channel, user);
        vety.client.emit("messageCreate", message);
      });
    });

    describe("Message commands", () => {
      it("command permissions", (_, testDone) => {
        withVety(testDone, async (createVety, done) => {
          const infoCmdCallUsers: string[] = [];
          const serverCmdCallUsers: string[] = [];
          const pingCmdCallUsers: string[] = [];

          const configSchema = z.strictObject({
            can_use_info_cmd: z.boolean().default(false),
            can_use_server_cmd: z.boolean().default(false),
            can_use_ping_cmd: z.boolean().default(false),
          });

          const contract = guildPluginContract({
            configSchema,
          });

          const TestPlugin = contract.plugin({
            name: "test-plugin",

            messageCommands: [
              contract.messageCommand({
                trigger: "info",
                permission: "can_use_info_cmd",
                run({ message }) {
                  infoCmdCallUsers.push(message.author.id);
                },
              }),
              contract.messageCommand({
                trigger: "server",
                permission: "can_use_server_cmd",
                run({ message }) {
                  serverCmdCallUsers.push(message.author.id);
                },
              }),
              contract.messageCommand({
                trigger: "ping",
                permission: "can_use_ping_cmd",
                run({ message }) {
                  pingCmdCallUsers.push(message.author.id);
                },
              }),
            ],
          });

          const vety = createVety({
            guildPlugins: [TestPlugin],
            options: {
              getEnabledGuildPlugins() {
                return ["test-plugin"];
              },
              getConfig() {
                return {
                  prefix: "!",
                  plugins: {
                    "test-plugin": {
                      overrides: [
                        {
                          user: user1.id,
                          config: {
                            can_use_info_cmd: true,
                          },
                        },
                        {
                          user: user2.id,
                          config: {
                            can_use_server_cmd: true,
                          },
                        },
                        {
                          role: role.id,
                          config: {
                            can_use_ping_cmd: true,
                          },
                        },
                      ],
                    },
                  },
                };
              },
              logFn: noop,
            },
          });

          const user1 = createMockUser(vety.client);
          const user2 = createMockUser(vety.client);
          const user3 = createMockUser(vety.client);
          const guild = createMockGuild(vety.client);
          const role = createMockRole(guild);

          await initializeVety(vety);

          void createMockMember(guild, user3, { roles: [role.id] });

          vety.client.ws.emit("GUILD_CREATE", guild);
          await sleep(10);

          const channel = createMockTextChannel(vety.client, guild.id);

          // !info
          const infoFromUser1Msg = createMockMessage(vety.client, channel, user1, { content: "!info" });
          vety.client.emit("messageCreate", infoFromUser1Msg);
          await sleep(10);
          const infoFromUser2Msg = createMockMessage(vety.client, channel, user2, { content: "!info" });
          vety.client.emit("messageCreate", infoFromUser2Msg);
          await sleep(10);

          // !server
          const serverFromUser1Msg = createMockMessage(vety.client, channel, user1, { content: "!server" });
          vety.client.emit("messageCreate", serverFromUser1Msg);
          await sleep(10);
          const serverFromUser2Msg = createMockMessage(vety.client, channel, user2, { content: "!server" });
          vety.client.emit("messageCreate", serverFromUser2Msg);
          await sleep(10);

          // !ping
          const pingFromUser1Msg = createMockMessage(vety.client, channel, user1, { content: "!ping" });
          vety.client.emit("messageCreate", pingFromUser1Msg);
          await sleep(10);
          const pingFromUser3Msg = createMockMessage(vety.client, channel, user3, { content: "!ping" });
          vety.client.emit("messageCreate", pingFromUser3Msg);
          await sleep(10);

          assert.deepStrictEqual(infoCmdCallUsers, [user1.id]);
          assert.deepStrictEqual(serverCmdCallUsers, [user2.id]);
          assert.deepStrictEqual(pingCmdCallUsers, [user3.id]);

          done();
        });
      });
    });

    describe("Slash commands", () => {
      it("Type inference in slash command function", () => {
        emptyGuildPluginContract.plugin({
          name: "slash-test-plugin",

          slashCommands: [
            emptyGuildPluginContract.slashCommand({
              name: "echo",
              description: "Repeat what you said",
              signature: [
                slashOptions.string({ name: "text1", description: "bar", required: true }),
                slashOptions.string({ name: "text2", description: "bar" }),
                slashOptions.string({ name: "text3", description: "bar", required: false }),
              ],
              run({ interaction, options }) {
                assertTypeEquals<string, typeof options.text1, true>();
                assertTypeEquals<null, typeof options.text1, false>(); // Required (required: true), cannot be null

                assertTypeEquals<string, typeof options.text2, true>();
                assertTypeEquals<null, typeof options.text2, true>(); // Optional (required: omitted), can be null

                assertTypeEquals<string, typeof options.text3, true>();
                assertTypeEquals<null, typeof options.text3, true>(); // Optional (required: false), can be null

                assertTypeEquals<ChatInputCommandInteraction, typeof interaction, true>();
              },
            }),
          ],
        });
      });

      it("Slash command group types", () => {
        emptyGuildPluginContract.plugin({
          name: "slash-test-plugin",

          slashCommands: [
            emptyGuildPluginContract.slashGroup({
              name: "top_level_group",
              description: "",
              subcommands: [
                emptyGuildPluginContract.slashCommand({
                  name: "one_level_down",
                  description: "",
                  signature: [],
                  run() {},
                }),

                emptyGuildPluginContract.slashGroup({
                  name: "second_level_group",
                  description: "",
                  subcommands: [
                    emptyGuildPluginContract.slashCommand({
                      name: "two_levels_down",
                      description: "",
                      signature: [],
                      run() {},
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });
    });
  });

  describe("Lifecycle hooks", () => {
    it("GuildPlugin beforeLoad()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToLoad = emptyGuildPluginContract.plugin({
          name: "plugin-to-load",

          beforeLoad() {
            done();
          },
        });

        const vety = createVety({
          guildPlugins: [PluginToLoad],
          options: {
            getEnabledGuildPlugins() {
              return ["plugin-to-load"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("GlobalPlugin beforeLoad()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToLoad = emptyGlobalPluginContract.plugin({
          name: "plugin-to-load",

          beforeLoad() {
            done();
          },
        });

        const vety = createVety({
          globalPlugins: [PluginToLoad],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
      });
    });

    it("GuildPlugin beforeStart()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToLoad = emptyGuildPluginContract.plugin({
          name: "plugin-to-load",

          beforeStart() {
            done();
          },
        });

        const vety = createVety({
          guildPlugins: [PluginToLoad],
          options: {
            getEnabledGuildPlugins() {
              return ["plugin-to-load"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("GlobalPlugin beforeStart()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToLoad = emptyGlobalPluginContract.plugin({
          name: "plugin-to-load",

          beforeStart() {
            done();
          },
        });

        const vety = createVety({
          globalPlugins: [PluginToLoad],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
      });
    });

    it("GuildPlugin afterLoad()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToLoad = emptyGuildPluginContract.plugin({
          name: "plugin-to-load",

          afterLoad() {
            done();
          },
        });

        const vety = createVety({
          guildPlugins: [PluginToLoad],
          options: {
            getEnabledGuildPlugins() {
              return ["plugin-to-load"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("GlobalPlugin afterLoad()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToLoad = emptyGlobalPluginContract.plugin({
          name: "plugin-to-load",

          afterLoad() {
            done();
          },
        });

        const vety = createVety({
          globalPlugins: [PluginToLoad],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
      });
    });

    it("GuildPlugin beforeUnload()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToUnload = emptyGuildPluginContract.plugin({
          name: "plugin-to-unload",

          afterLoad() {
            vety.client.emit("guildUnavailable", guild);
          },

          beforeUnload() {
            done();
          },
        });

        const vety = createVety({
          guildPlugins: [PluginToUnload],
          options: {
            getEnabledGuildPlugins() {
              return ["plugin-to-unload"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("GlobalPlugin beforeUnload()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToLoad = emptyGlobalPluginContract.plugin({
          name: "plugin-to-load",

          beforeUnload() {
            done();
          },
        });

        const vety = createVety({
          globalPlugins: [PluginToLoad],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
        void vety.destroy();
      });
    });

    it("GuildPlugin afterUnload()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToUnload = emptyGuildPluginContract.plugin({
          name: "plugin-to-unload",

          afterLoad() {
            vety.client.emit("guildUnavailable", guild);
          },

          afterUnload() {
            done();
          },
        });

        const vety = createVety({
          guildPlugins: [PluginToUnload],
          options: {
            getEnabledGuildPlugins() {
              return ["plugin-to-unload"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("GlobalPlugin afterUnload()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToLoad = emptyGlobalPluginContract.plugin({
          name: "plugin-to-load",

          afterUnload() {
            done();
          },
        });

        const vety = createVety({
          globalPlugins: [PluginToLoad],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
        void vety.destroy();
      });
    });

    it("GuildPlugin afterLoad() runs after beforeLoad()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        let beforeLoadCalled = false;

        const PluginToLoad = emptyGuildPluginContract.plugin({
          name: "plugin-to-load",

          beforeLoad() {
            beforeLoadCalled = true;
          },

          afterLoad() {
            assert.strictEqual(beforeLoadCalled, true);
            done();
          },
        });

        const vety = createVety({
          guildPlugins: [PluginToLoad],
          options: {
            getEnabledGuildPlugins() {
              return ["plugin-to-load"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("GlobalPlugin afterLoad() runs after beforeLoad()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        let beforeLoadCalled = false;

        const PluginToLoad = emptyGlobalPluginContract.plugin({
          name: "plugin-to-load",

          beforeLoad() {
            beforeLoadCalled = true;
          },

          afterLoad() {
            assert.strictEqual(beforeLoadCalled, true);
            done();
          },
        });

        const vety = createVety({
          globalPlugins: [PluginToLoad],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
      });
    });

    it("GuildPlugin beforeUnload() runs before afterUnload()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        let beforeUnloadCalled = false;

        const PluginToUnload = emptyGuildPluginContract.plugin({
          name: "plugin-to-unload",

          afterLoad() {
            vety.client.emit("guildUnavailable", guild);
          },

          beforeUnload() {
            beforeUnloadCalled = true;
          },

          afterUnload() {
            assert.strictEqual(beforeUnloadCalled, true);
            done();
          },
        });

        const vety = createVety({
          guildPlugins: [PluginToUnload],
          options: {
            getEnabledGuildPlugins() {
              return ["plugin-to-unload"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("GlobalPlugin beforeUnload() runs before afterUnload()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        let beforeUnloadCalled = false;

        const PluginToUnload = emptyGlobalPluginContract.plugin({
          name: "plugin-to-unload",

          beforeUnload() {
            beforeUnloadCalled = true;
          },

          afterUnload() {
            assert.strictEqual(beforeUnloadCalled, true);
            done();
          },
        });

        const vety = createVety({
          globalPlugins: [PluginToUnload],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
        void vety.destroy();
      });
    });

    it("hasPlugin() and getPlugin() are unavailable in GuildPlugin beforeLoad()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToLoad = emptyGuildPluginContract.plugin({
          name: "plugin-to-load",

          beforeLoad(pluginData) {
            assert.throws(() => pluginData.hasPlugin({} as AnyPluginBlueprint));
            assert.throws(() => pluginData.getPlugin({} as AnyPluginBlueprint));
            done();
          },
        });

        const vety = createVety({
          guildPlugins: [PluginToLoad],
          options: {
            getEnabledGuildPlugins() {
              return ["plugin-to-load"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("hasPlugin() and getPlugin() are unavailable in GlobalPlugin beforeLoad()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToLoad = emptyGlobalPluginContract.plugin({
          name: "plugin-to-load",

          beforeLoad(pluginData) {
            assert.throws(() => pluginData.hasPlugin({} as AnyPluginBlueprint));
            assert.throws(() => pluginData.getPlugin({} as AnyPluginBlueprint));
            done();
          },
        });

        const vety = createVety({
          globalPlugins: [PluginToLoad],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
      });
    });

    it("hasPlugin() and getPlugin() are unavailable in GuildPlugin afterUnload()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToUnload = emptyGuildPluginContract.plugin({
          name: "plugin-to-unload",

          afterLoad() {
            vety.client.emit("guildUnavailable", guild);
          },

          afterUnload(pluginData) {
            assert.throws(() => pluginData.hasPlugin({} as AnyPluginBlueprint));
            assert.throws(() => pluginData.getPlugin({} as AnyPluginBlueprint));
            done();
          },
        });

        const vety = createVety({
          guildPlugins: [PluginToUnload],
          options: {
            getEnabledGuildPlugins() {
              return ["plugin-to-unload"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("hasPlugin() and getPlugin() are unavailable in GlobalPlugin afterUnload()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginToLoad = emptyGlobalPluginContract.plugin({
          name: "plugin-to-load",

          afterUnload(pluginData) {
            assert.throws(() => pluginData.hasPlugin({} as AnyPluginBlueprint));
            assert.throws(() => pluginData.getPlugin({} as AnyPluginBlueprint));
            done();
          },
        });

        const vety = createVety({
          globalPlugins: [PluginToLoad],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
        void vety.destroy();
      });
    });

    it("GuildPlugin is unavailable to other plugins during afterUnload()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginWithPublicInterface = emptyGuildPluginContract.plugin({
          name: "plugin-with-public-interface",

          public() {
            return {};
          },
        });

        const PluginWithTests = emptyGuildPluginContract.plugin({
          name: "plugin-with-tests",
          dependencies: () => [PluginWithPublicInterface],
          afterLoad() {
            vety.client.emit("guildUnavailable", guild);
          },
          afterUnload(pluginData) {
            assert.throws(() => pluginData.getPlugin(PluginWithPublicInterface));
            done();
          },
        });

        const vety = createVety({
          guildPlugins: [PluginWithPublicInterface, PluginWithTests],
          options: {
            getEnabledGuildPlugins() {
              return ["plugin-with-tests"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("GlobalPlugin is unavailable to other plugins during afterUnload()", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const PluginWithPublicInterface = emptyGlobalPluginContract.plugin({
          name: "plugin-with-public-interface",

          public() {
            return {};
          },
        });

        const PluginWithTests = emptyGlobalPluginContract.plugin({
          name: "plugin-with-tests",
          dependencies: () => [PluginWithPublicInterface],
          afterLoad() {
            void vety.destroy();
          },
          afterUnload(pluginData) {
            assert.throws(() => pluginData.getPlugin(PluginWithPublicInterface));
            done();
          },
        });

        const vety = createVety({
          globalPlugins: [PluginWithPublicInterface, PluginWithTests],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
      });
    });

    it("GuildPlugin hook order", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        let lastCalledHook: string | null = null;

        const PluginToLoad = emptyGuildPluginContract.plugin({
          name: "plugin-to-load",
          beforeLoad() {
            assert.strictEqual(lastCalledHook, null);
            lastCalledHook = "beforeLoad";
          },
          beforeStart() {
            assert.strictEqual(lastCalledHook, "beforeLoad");
            lastCalledHook = "beforeStart";
          },
          afterLoad() {
            assert.strictEqual(lastCalledHook, "beforeStart");
            lastCalledHook = "afterLoad";
            vety.client.emit("guildUnavailable", guild);
          },
          beforeUnload() {
            assert.strictEqual(lastCalledHook, "afterLoad");
            lastCalledHook = "beforeUnload";
          },
          afterUnload() {
            assert.strictEqual(lastCalledHook, "beforeUnload");
            done();
          },
        });

        const vety = createVety({
          guildPlugins: [PluginToLoad],
          options: {
            getEnabledGuildPlugins() {
              return ["plugin-to-load"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("GlobalPlugin hook order", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        let lastCalledHook: string | null = null;

        const PluginToLoad = emptyGlobalPluginContract.plugin({
          name: "plugin-to-load",
          beforeLoad() {
            assert.strictEqual(lastCalledHook, null);
            lastCalledHook = "beforeLoad";
          },
          beforeStart() {
            assert.strictEqual(lastCalledHook, "beforeLoad");
            lastCalledHook = "beforeStart";
          },
          afterLoad() {
            assert.strictEqual(lastCalledHook, "beforeStart");
            lastCalledHook = "afterLoad";
            void vety.destroy();
          },
          beforeUnload() {
            assert.strictEqual(lastCalledHook, "afterLoad");
            lastCalledHook = "beforeUnload";
          },
          afterUnload() {
            assert.strictEqual(lastCalledHook, "beforeUnload");
            done();
          },
        });

        const vety = createVety({
          globalPlugins: [PluginToLoad],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
      });
    });
  });

  describe("Dependencies", () => {
    it("hasPlugin", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const DependencyToLoad = emptyGuildPluginContract.plugin({
          name: "dependency-to-load",
        });

        const SomeOtherPlugin = emptyGuildPluginContract.plugin({
          name: "some-other-plugin",
        });

        const PluginToLoad = emptyGuildPluginContract.plugin({
          name: "plugin-to-load",
          dependencies: () => [DependencyToLoad],

          afterLoad(pluginData) {
            assert.ok(pluginData.hasPlugin(DependencyToLoad));
            assert.ok(!pluginData.hasPlugin(SomeOtherPlugin));
            done();
          },
        });

        const vety = createVety({
          guildPlugins: [DependencyToLoad, PluginToLoad],
          options: {
            getEnabledGuildPlugins() {
              return ["dependency-to-load", "plugin-to-load"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("getPlugin", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        interface DependencyPluginType extends AnyPluginType {
          state: { value: number };
        }

        const dependencyContract = guildPluginContract({
          configSchema: z.strictObject({}),
          stateSchema: z.strictObject({ value: z.number() }),
        });

        const DependencyToLoad = dependencyContract.plugin({
          name: "dependency-to-load",

          public(pluginData) {
            return {
              ok() {
                assert.strictEqual(pluginData.state.value, 10);
                done();
              },
            };
          },

          beforeLoad(pluginData) {
            pluginData.state.value = 10;
          },
        });

        const PluginToLoad = emptyGuildPluginContract.plugin({
          name: "plugin-to-load",

          afterLoad(pluginData) {
            const instance = pluginData.getPlugin(DependencyToLoad);
            instance.ok();
          },
        });

        const vety = createVety({
          guildPlugins: [DependencyToLoad, PluginToLoad],
          options: {
            getEnabledGuildPlugins() {
              return ["dependency-to-load", "plugin-to-load"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("hasGlobalPlugin", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const SomeGlobalPlugin = emptyGlobalPluginContract.plugin({
          name: "some-global-plugin",
          public() {
            return {
              works: () => true,
            };
          },
        });

        const SomeGuildPlugin = emptyGuildPluginContract.plugin({
          name: "some-guild-plugin",

          beforeLoad(pluginData) {
            const hasGlobalPlugin = pluginData.hasGlobalPlugin(SomeGlobalPlugin);
            assert.strictEqual(hasGlobalPlugin, true);
            done();
          },
        });

        const vety = createVety({
          globalPlugins: [SomeGlobalPlugin],
          guildPlugins: [SomeGuildPlugin],
          options: {
            getEnabledGuildPlugins() {
              return ["some-guild-plugin"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("getPlugin", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const SomeGlobalPlugin = emptyGlobalPluginContract.plugin({
          name: "some-global-plugin",
          public() {
            return {
              works: () => true,
            };
          },
        });

        const SomeGuildPlugin = emptyGuildPluginContract.plugin({
          name: "some-guild-plugin",

          beforeLoad(pluginData) {
            const globalPlugin = pluginData.getGlobalPlugin(SomeGlobalPlugin);
            assert.strictEqual(globalPlugin.works(), true);
            done();
          },
        });

        const vety = createVety({
          globalPlugins: [SomeGlobalPlugin],
          guildPlugins: [SomeGuildPlugin],
          options: {
            getEnabledGuildPlugins() {
              return ["some-guild-plugin"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("getPlugin has correct pluginData", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const dependencyContract = guildPluginContract({
          configSchema: z.strictObject({
            some_value: z.string().default("cookies"),
          }),
        });

        const DependencyToLoad = dependencyContract.plugin({
          name: "dependency-to-load",

          public(pluginData) {
            return {
              async ok() {
                assert.ok(pluginData != null);
                assert.strictEqual(pluginData.config.get().some_value, "cookies");
                assert.notStrictEqual(pluginData.config.get().some_value, "milk");

                done();
              },
            };
          },
        });

        const pluginContract = guildPluginContract({
          configSchema: z.strictObject({
            some_value: z.string().default("milk"),
          }),
        });

        const PluginToLoad = pluginContract.plugin({
          name: "plugin-to-load",

          afterLoad(pluginData) {
            const instance = pluginData.getPlugin(DependencyToLoad);
            instance.ok();
          },
        });

        const vety = createVety({
          guildPlugins: [DependencyToLoad, PluginToLoad],
          options: {
            getEnabledGuildPlugins() {
              return ["dependency-to-load", "plugin-to-load"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("automatic dependency loading", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const DependencyToLoad = emptyGuildPluginContract.plugin({
          name: "dependency-to-load",
        });

        const OtherDependencyToLoad = emptyGuildPluginContract.plugin({
          name: "other-dependency-to-load",
        });

        const PluginToLoad = emptyGuildPluginContract.plugin({
          name: "plugin-to-load",

          dependencies: () => [DependencyToLoad, OtherDependencyToLoad],

          afterLoad(pluginData) {
            assert.ok(pluginData.hasPlugin(DependencyToLoad));
            assert.ok(pluginData.hasPlugin(OtherDependencyToLoad));
            done();
          },
        });

        const vety = createVety({
          guildPlugins: [DependencyToLoad, OtherDependencyToLoad, PluginToLoad],
          options: {
            getEnabledGuildPlugins() {
              return ["plugin-to-load"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("transitive dependencies", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const DependencyTwo = emptyGuildPluginContract.plugin({
          name: "dependency-two",
        });
        const DependencyOne = emptyGuildPluginContract.plugin({
          name: "dependency-one",
          dependencies: () => [DependencyTwo],
        });

        const PluginToLoad = emptyGuildPluginContract.plugin({
          name: "plugin-to-load",

          dependencies: () => [DependencyOne],

          afterLoad(pluginData) {
            assert.ok(pluginData.hasPlugin(DependencyOne));
            assert.ok(pluginData.hasPlugin(DependencyTwo));
            done();
          },
        });

        const vety = createVety({
          guildPlugins: [DependencyOne, DependencyTwo, PluginToLoad],
          options: {
            getEnabledGuildPlugins() {
              return ["plugin-to-load"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("plugins loaded as dependencies do not load commands or events", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const Dependency = emptyGuildPluginContract.plugin({
          name: "dependency",

          messageCommands: [emptyGuildPluginContract.messageCommand({ trigger: "foo", permission: null, run: noop })],
          events: [emptyGuildPluginContract.eventListener({ event: "messageCreate", listener: noop })],

          afterLoad(pluginData) {
            // The command above should *not* be loaded
            assert.strictEqual(pluginData.messageCommands.getAll().length, 0);
            // The event listener above should *not* be loaded, and neither should the default message listener
            assert.strictEqual(pluginData.events.getListenerCount(), 0);

            done();
          },
        });

        const PluginToLoad = emptyGuildPluginContract.plugin({
          name: "plugin-to-load",
          dependencies: () => [Dependency],
        });

        const vety = createVety({
          guildPlugins: [Dependency, PluginToLoad],
          options: {
            getEnabledGuildPlugins() {
              return ["plugin-to-load"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });
  });

  describe("Custom overrides", () => {
    it("Synchronous custom overrides", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        let commandTriggers = 0;

        const contract = guildPluginContract({
          configSchema: z.strictObject({
            can_do: z.boolean().default(false),
          }),
          customOverrideCriteriaSchema: z.strictObject({
            myUserOverride: z.string(),
          }),
        });

        const TestPlugin = contract.plugin({
          name: "test-plugin",

          customOverrideCriteriaFunctions: {
            myUserOverride: (pluginData, matchParams, value) => matchParams.userId === value,
          },

          messageCommands: [
            contract.messageCommand({
              trigger: "foo",
              permission: "can_do",
              run() {
                commandTriggers++;
              },
            }),
          ],

          async afterLoad() {
            const channel = createMockTextChannel(vety.client, guild.id);

            const message1 = createMockMessage(vety.client, channel, user1, { content: "!foo" });
            vety.client.emit("messageCreate", message1);
            await sleep(30);

            const message2 = createMockMessage(vety.client, channel, user2, { content: "!foo" });
            vety.client.emit("messageCreate", message2);
            await sleep(30);

            assert.equal(commandTriggers, 1);
            done();
          },
        });

        const vety = createVety({
          guildPlugins: [TestPlugin],
          options: {
            getEnabledGuildPlugins() {
              return ["test-plugin"];
            },
            getConfig() {
              return {
                prefix: "!",
                plugins: {
                  "test-plugin": {
                    overrides: [
                      {
                        extra: {
                          myUserOverride: user1.id,
                        },
                        config: {
                          can_do: true,
                        },
                      },
                    ],
                  },
                },
              };
            },
            logFn: noop,
          },
        });

        const user1 = createMockUser(vety.client);
        const user2 = createMockUser(vety.client);

        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("Asynchronous custom overrides", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        let commandTriggers = 0;

        const contract = guildPluginContract({
          configSchema: z.strictObject({
            can_do: z.boolean().default(false),
          }),
          customOverrideCriteriaSchema: z.strictObject({
            myAsyncUserOverride: z.string(),
          }),
        });

        const TestPlugin = contract.plugin({
          name: "test-plugin",

          customOverrideCriteriaFunctions: {
            myAsyncUserOverride: async (pluginData, matchParams, value) => {
              await sleep(5);
              return matchParams.userId === value;
            },
          },

          messageCommands: [
            contract.messageCommand({
              trigger: "foo",
              permission: "can_do",
              run() {
                commandTriggers++;
              },
            }),
          ],

          async afterLoad() {
            const channel = createMockTextChannel(vety.client, guild.id);

            const message1 = createMockMessage(vety.client, channel, user1, { content: "!foo" });
            vety.client.emit("messageCreate", message1);
            await sleep(30);

            const message2 = createMockMessage(vety.client, channel, user2, { content: "!foo" });
            vety.client.emit("messageCreate", message2);
            await sleep(30);

            assert.equal(commandTriggers, 1);

            done();
          },
        });

        const vety = createVety({
          guildPlugins: [TestPlugin],
          options: {
            getEnabledGuildPlugins() {
              return ["test-plugin"];
            },
            getConfig() {
              return {
                prefix: "!",
                plugins: {
                  "test-plugin": {
                    overrides: [
                      {
                        extra: {
                          myAsyncUserOverride: user1.id,
                        },
                        config: {
                          can_do: true,
                        },
                      },
                    ],
                  },
                },
              };
            },
            logFn: noop,
          },
        });

        const user1 = createMockUser(vety.client);
        const user2 = createMockUser(vety.client);

        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });
  });

  describe("Custom argument types", () => {
    it("Custom argument types", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const types = {
          foo: (value, ctx) => {
            return `${value}-${ctx.pluginData.guild.id}`;
          },
        };

        const TestPlugin = emptyGuildPluginContract.plugin({
          name: "test-plugin",

          messageCommands: [
            emptyGuildPluginContract.messageCommand({
              trigger: "foo",
              permission: null,
              signature: parseSignature("<str:foo>", types, "foo"),
              run({ args: { str } }) {
                assert.equal(str, `bar-${guild.id}`);
                done();
              },
            }),
          ],

          afterLoad() {
            const channel = createMockTextChannel(vety.client, guild.id);
            const user = createMockUser(vety.client);
            const msg = createMockMessage(vety.client, channel, user, { content: "!foo bar" });
            vety.client.emit("messageCreate", msg);
          },
        });

        const vety = createVety({
          guildPlugins: [TestPlugin],
          options: {
            getEnabledGuildPlugins() {
              return ["test-plugin"];
            },
            getConfig() {
              return {
                prefix: "!",
              };
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });
  });

  describe("Misc", () => {
    it("pluginData contains everything (guild plugin)", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const TestPlugin = emptyGuildPluginContract.plugin({
          name: "test-plugin",

          afterLoad(pluginData) {
            assert.ok(pluginData.client != null);
            assert.ok((pluginData.cooldowns as unknown) instanceof CooldownManager);
            assert.ok((pluginData.messageCommands as unknown) instanceof PluginMessageCommandManager);
            assert.ok((pluginData.slashCommands as unknown) instanceof PluginSlashCommandManager);
            assert.ok((pluginData.contextMenuCommands as unknown) instanceof PluginContextMenuCommandManager);
            assert.ok((pluginData.config as unknown) instanceof PluginConfigManager);
            assert.ok((pluginData.events as unknown) instanceof GuildPluginEventManager);
            assert.ok((pluginData.locks as unknown) instanceof LockManager);
            done();
          },
        });

        const vety = createVety({
          guildPlugins: [TestPlugin],
          options: {
            getEnabledGuildPlugins() {
              return ["test-plugin"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });

    it("pluginData contains everything (global plugin)", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        const TestPlugin = emptyGlobalPluginContract.plugin({
          name: "test-plugin",

          afterLoad(pluginData) {
            assert.ok(pluginData.client != null);
            assert.ok((pluginData.cooldowns as unknown) instanceof CooldownManager);
            assert.ok((pluginData.messageCommands as unknown) instanceof PluginMessageCommandManager);
            assert.ok((pluginData.slashCommands as unknown) instanceof PluginSlashCommandManager);
            assert.ok((pluginData.contextMenuCommands as unknown) instanceof PluginContextMenuCommandManager);
            assert.ok((pluginData.config as unknown) instanceof PluginConfigManager);
            assert.ok((pluginData.events as unknown) instanceof GlobalPluginEventManager);
            assert.ok((pluginData.locks as unknown) instanceof LockManager);
            done();
          },
        });

        const vety = createVety({
          globalPlugins: [TestPlugin],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
      });
    });

    it("event handlers are unloaded on plugin unload", (_, testDone) => {
      withVety(testDone, async (createVety, done) => {
        let msgEvFnCallNum = 0;

        const messageEv = emptyGuildPluginContract.eventListener({
          event: "messageCreate",
          listener() {
            msgEvFnCallNum++;
            vety.client.emit("guildUnavailable", guild);
            sleep(30).then(async () => {
              const msg2 = createMockMessage(vety.client, textChannel, author, { content: "hi!" });
              vety.client.emit("messageCreate", msg2);
              await sleep(30);

              assert.strictEqual(msgEvFnCallNum, 1);

              done();
            });
          },
        });

        const PluginToUnload = emptyGuildPluginContract.plugin({
          name: "plugin-to-unload",
          events: [messageEv],
          afterLoad() {
            const msg = createMockMessage(vety.client, textChannel, author, { content: "hi!" });
            vety.client.emit("messageCreate", msg);
          },
        });

        const vety = createVety({
          guildPlugins: [PluginToUnload],
          options: {
            getEnabledGuildPlugins() {
              return ["plugin-to-unload"];
            },
            logFn: noop,
          },
        });
        await initializeVety(vety);

        const guild = createMockGuild(vety.client);
        const textChannel = createMockTextChannel(vety.client, guild.id);
        const author = createMockUser(vety.client);
        vety.client.ws.emit("GUILD_CREATE", guild);
      });
    });
  });

  describe("guildPluginContract()", () => {
    const configSchema = z.strictObject({
      example: z.number().transform((v) => String(v)),
    });
    const stateSchema = z.strictObject({
      storedValue: z.string(),
    });
    const customOverrideMatchParamsSchema = z.strictObject({
      matchParamColor: z.string(),
    });
    const testContract = guildPluginContract({
      configSchema,
      stateSchema,
      customOverrideCriteriaSchema: z.strictObject({
        criteriaColor: z.string(),
      }),
      customOverrideMatchParamsSchema,
    });
    type ConfigSchemaOutput = z.output<typeof configSchema>;
    type StateSchemaOutput = z.output<typeof stateSchema>;
    type CustomOverrideMatchParamsSchemaOutput = z.output<typeof customOverrideMatchParamsSchema>;

    it("config schema is included in blueprint", () => {
      const plugin = testContract.plugin({
        name: "my-plugin",
      });
      assert.strictEqual(plugin.configSchema, configSchema);
    });

    it("config type is inferred correctly", () => {
      testContract.plugin({
        name: "",
        beforeLoad(pluginData) {
          const config = pluginData.config.get();
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof config, ConfigSchemaOutput> = true;
        },
      });

      testContract.messageCommand({
        trigger: "",
        permission: null,
        run({ pluginData }) {
          const config = pluginData.config.get();
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof config, ConfigSchemaOutput> = true;
        },
      });

      testContract.slashCommand({
        name: "",
        description: "",
        signature: [],
        run({ pluginData }) {
          const config = pluginData.config.get();
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof config, ConfigSchemaOutput> = true;
        },
      });

      testContract.messageContextMenuCommand({
        name: "",
        description: "",
        signature: [],
        run({ pluginData }) {
          const config = pluginData.config.get();
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof config, ConfigSchemaOutput> = true;
        },
      });

      testContract.userContextMenuCommand({
        name: "",
        description: "",
        signature: [],
        run({ pluginData }) {
          const config = pluginData.config.get();
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof config, ConfigSchemaOutput> = true;
        },
      });
    });

    it("state type is inferred correctly", () => {
      testContract.plugin({
        name: "",
        beforeLoad(pluginData) {
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof pluginData.state, StateSchemaOutput> = true;
        },
      });

      testContract.messageCommand({
        trigger: "",
        permission: null,
        run({ pluginData }) {
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof pluginData.state, StateSchemaOutput> = true;
        },
      });

      testContract.slashCommand({
        name: "",
        description: "",
        signature: [],
        run({ pluginData }) {
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof pluginData.state, StateSchemaOutput> = true;
        },
      });

      testContract.messageContextMenuCommand({
        name: "",
        description: "",
        signature: [],
        run({ pluginData }) {
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof pluginData.state, StateSchemaOutput> = true;
        },
      });

      testContract.userContextMenuCommand({
        name: "",
        description: "",
        signature: [],
        run({ pluginData }) {
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof pluginData.state, StateSchemaOutput> = true;
        },
      });
    });

    it("custom override criteria type is inferred correctly", () => {
      testContract.plugin({
        name: "",
        // @ts-expect-error: error on missing criteriaColor function
        customOverrideCriteriaFunctions: {},
      });
    });

    it("custom override match params type is inferred correctly", () => {
      testContract.plugin({
        name: "",
        customOverrideCriteriaFunctions: {
          // Type-only test:
          criteriaColor: (_pluginData, matchParams) => {
            /* oxlint-disable-next-line no-unused-vars */
            const typeCheck: AssertEquals<typeof matchParams.extra, CustomOverrideMatchParamsSchemaOutput | undefined> =
              true;
            return true;
          },
        },
      });
    });

    // Note: public interface *functionality* is already tested by Dependencies#getPlugin above
    it("public interface type is inferred correctly", () => {
      const pluginWithInterface = emptyGuildPluginContract.plugin({
        name: "plugin-with-interface",
        public() {
          return {
            foo: () => 5,
          };
        },
      });

      emptyGuildPluginContract.plugin({
        name: "regular-plugin",
        afterLoad(pluginData) {
          const publicInterface = pluginData.getPlugin(pluginWithInterface);
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof publicInterface, { foo: () => number }> = true;
        },
      });
    });
  });

  describe("globalPluginContract()", () => {
    const configSchema = z.strictObject({
      example: z.number().transform((v) => String(v)),
    });
    const stateSchema = z.strictObject({
      storedValue: z.string(),
    });
    const customOverrideMatchParamsSchema = z.strictObject({
      matchParamColor: z.string(),
    });
    const testContract = globalPluginContract({
      configSchema,
      stateSchema,
      customOverrideCriteriaSchema: z.strictObject({
        criteriaColor: z.string(),
      }),
      customOverrideMatchParamsSchema,
    });
    type ConfigSchemaOutput = z.output<typeof configSchema>;
    type StateSchemaOutput = z.output<typeof stateSchema>;
    type CustomOverrideMatchParamsSchemaOutput = z.output<typeof customOverrideMatchParamsSchema>;

    it("config schema is included in blueprint", () => {
      const plugin = testContract.plugin({
        name: "my-plugin",
      });
      assert.strictEqual(plugin.configSchema, configSchema);
    });

    it("config type is inferred correctly", () => {
      testContract.plugin({
        name: "",
        beforeLoad(pluginData) {
          const config = pluginData.config.get();
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof config, ConfigSchemaOutput> = true;
        },
      });

      testContract.messageCommand({
        trigger: "",
        permission: null,
        run({ pluginData }) {
          const config = pluginData.config.get();
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof config, ConfigSchemaOutput> = true;
        },
      });

      testContract.slashCommand({
        name: "",
        description: "",
        signature: [],
        run({ pluginData }) {
          const config = pluginData.config.get();
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof config, ConfigSchemaOutput> = true;
        },
      });

      testContract.messageContextMenuCommand({
        name: "",
        description: "",
        signature: [],
        run({ pluginData }) {
          const config = pluginData.config.get();
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof config, ConfigSchemaOutput> = true;
        },
      });

      testContract.userContextMenuCommand({
        name: "",
        description: "",
        signature: [],
        run({ pluginData }) {
          const config = pluginData.config.get();
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof config, ConfigSchemaOutput> = true;
        },
      });
    });

    it("state type is inferred correctly", () => {
      testContract.plugin({
        name: "",
        beforeLoad(pluginData) {
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof pluginData.state, StateSchemaOutput> = true;
        },
      });

      testContract.messageCommand({
        trigger: "",
        permission: null,
        run({ pluginData }) {
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof pluginData.state, StateSchemaOutput> = true;
        },
      });

      testContract.slashCommand({
        name: "",
        description: "",
        signature: [],
        run({ pluginData }) {
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof pluginData.state, StateSchemaOutput> = true;
        },
      });

      testContract.messageContextMenuCommand({
        name: "",
        description: "",
        signature: [],
        run({ pluginData }) {
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof pluginData.state, StateSchemaOutput> = true;
        },
      });

      testContract.userContextMenuCommand({
        name: "",
        description: "",
        signature: [],
        run({ pluginData }) {
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof pluginData.state, StateSchemaOutput> = true;
        },
      });
    });

    it("custom override criteria type is inferred correctly", () => {
      testContract.plugin({
        name: "",
        // @ts-expect-error: error on missing criteriaColor function
        customOverrideCriteriaFunctions: {},
      });
    });

    it("custom override match params type is inferred correctly", () => {
      testContract.plugin({
        name: "",
        customOverrideCriteriaFunctions: {
          // Type-only test:
          criteriaColor: (_pluginData, matchParams) => {
            /* oxlint-disable-next-line no-unused-vars */
            const typeCheck: AssertEquals<typeof matchParams.extra, CustomOverrideMatchParamsSchemaOutput | undefined> =
              true;
            return true;
          },
        },
      });
    });

    // Note: public interface *functionality* is already tested by Dependencies#getPlugin above
    it("public interface type is inferred correctly", () => {
      const pluginWithInterface = emptyGlobalPluginContract.plugin({
        name: "plugin-with-interface",
        public() {
          return {
            foo: () => 5,
          };
        },
      });

      emptyGlobalPluginContract.plugin({
        name: "regular-plugin",
        afterLoad(pluginData) {
          const publicInterface = pluginData.getPlugin(pluginWithInterface);
          /* oxlint-disable-next-line no-unused-vars */
          const typeCheck: AssertEquals<typeof publicInterface, { foo: () => number }> = true;
        },
      });
    });
  });
});
