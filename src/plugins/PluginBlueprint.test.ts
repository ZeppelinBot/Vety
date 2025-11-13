import { assert, expect } from "chai";
import type { ChatInputCommandInteraction, TextChannel } from "discord.js";
import { parseSignature } from "knub-command-manager";
import { describe, it } from "mocha";
import z from "zod";
import { guildPluginMessageContextMenuCommand } from "../commands/contextMenuCommands/contextMenuCommandBlueprint.ts";
import { PluginContextMenuCommandManager } from "../commands/contextMenuCommands/PluginContextMenuCommandManager.ts";
import { guildPluginMessageCommand } from "../commands/messageCommands/messageCommandBlueprint.ts";
import { PluginMessageCommandManager } from "../commands/messageCommands/PluginMessageCommandManager.ts";
import { PluginSlashCommandManager } from "../commands/slashCommands/PluginSlashCommandManager.ts";
import { PluginConfigManager } from "../config/PluginConfigManager.ts";
import { globalPluginEventListener, guildPluginEventListener } from "../events/EventListenerBlueprint.ts";
import { GlobalPluginEventManager } from "../events/GlobalPluginEventManager.ts";
import { GuildPluginEventManager } from "../events/GuildPluginEventManager.ts";
import {
  CooldownManager,
  type GlobalPluginBlueprint,
  type GlobalPluginData,
  guildPluginSlashCommand,
  guildPluginSlashGroup,
  LockManager,
  slashOptions,
} from "../index.ts";
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
import { type AnyPluginBlueprint, type GuildPluginBlueprint, globalPlugin, guildPlugin } from "./PluginBlueprint.ts";
import { type GuildPluginData, isGlobalPluginData } from "./PluginData.ts";
import type { BasePluginType } from "./pluginTypes.ts";

type AssertEquals<TActual, TExpected> = TActual extends TExpected ? true : false;

describe("PluginBlueprint", () => {
  describe("Commands and events", () => {
    it("loads commands and events", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginToLoad = guildPlugin({
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

          messageCommands: [guildPluginMessageCommand({ trigger: "foo", permission: null, run: noop })],
          slashCommands: [guildPluginSlashCommand({ name: "bar", description: "", signature: [], run: noop })],
          contextMenuCommands: [guildPluginMessageContextMenuCommand({ name: "baz", run: noop })],
          events: [guildPluginEventListener({ event: "messageCreate", listener: noop })],

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

    it("guild events are only passed to the matching guild", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginToLoad = guildPlugin({
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

          events: [
            guildPluginEventListener({
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

    it("global events are not passed to guild event listeners", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginToLoad = guildPlugin({
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

          events: [
            // @ts-expect-error: "userUpdate" is not a valid guild event
            guildPluginEventListener({
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

    it("global events are passed to global event listeners", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginToLoad = globalPlugin({
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

          events: [
            globalPluginEventListener({
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

    it("guild events are passed to global event listeners", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginToLoad = globalPlugin({
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

          events: [
            globalPluginEventListener({
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
      it("command permissions", (mochaDone) => {
        withVety(mochaDone, async (createVety, done) => {
          const infoCmdCallUsers: string[] = [];
          const serverCmdCallUsers: string[] = [];
          const pingCmdCallUsers: string[] = [];

          const configSchema = z.strictObject({
            can_use_info_cmd: z.boolean().default(false),
            can_use_server_cmd: z.boolean().default(false),
            can_use_ping_cmd: z.boolean().default(false),
          });
          interface PluginType extends BasePluginType {
            configSchema: typeof configSchema;
          }

          const TestPlugin = guildPlugin<PluginType>()({
            name: "test-plugin",
            configSchema,

            messageCommands: [
              guildPluginMessageCommand({
                trigger: "info",
                permission: "can_use_info_cmd",
                run({ message }) {
                  infoCmdCallUsers.push(message.author.id);
                },
              }),
              guildPluginMessageCommand({
                trigger: "server",
                permission: "can_use_server_cmd",
                run({ message }) {
                  serverCmdCallUsers.push(message.author.id);
                },
              }),
              guildPluginMessageCommand({
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
        guildPlugin({
          name: "slash-test-plugin",
          configSchema: z.strictObject({}),

          slashCommands: [
            guildPluginSlashCommand({
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
        guildPlugin({
          name: "slash-test-plugin",
          configSchema: z.strictObject({}),

          slashCommands: [
            guildPluginSlashGroup({
              name: "top_level_group",
              description: "",
              subcommands: [
                guildPluginSlashCommand({
                  name: "one_level_down",
                  description: "",
                  signature: [],
                  run() {},
                }),

                guildPluginSlashGroup({
                  name: "second_level_group",
                  description: "",
                  subcommands: [
                    guildPluginSlashCommand({
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
    it("GuildPlugin beforeLoad()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginToLoad: GuildPluginBlueprint<GuildPluginData<BasePluginType>, any> = {
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

          beforeLoad() {
            done();
          },
        };

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

    it("GlobalPlugin beforeLoad()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginToLoad: GlobalPluginBlueprint<GlobalPluginData<BasePluginType>, any> = {
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

          beforeLoad() {
            done();
          },
        };

        const vety = createVety({
          globalPlugins: [PluginToLoad],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
      });
    });

    it("GuildPlugin beforeStart()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginToLoad: GuildPluginBlueprint<GuildPluginData<BasePluginType>, any> = {
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

          beforeStart() {
            done();
          },
        };

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

    it("GlobalPlugin beforeStart()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginToLoad: GlobalPluginBlueprint<GlobalPluginData<BasePluginType>, any> = {
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

          beforeStart() {
            done();
          },
        };

        const vety = createVety({
          globalPlugins: [PluginToLoad],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
      });
    });

    it("GuildPlugin afterLoad()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginToLoad: GuildPluginBlueprint<GuildPluginData<BasePluginType>, any> = {
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

          afterLoad() {
            done();
          },
        };

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

    it("GlobalPlugin afterLoad()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginToLoad: GlobalPluginBlueprint<GlobalPluginData<BasePluginType>, any> = {
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

          afterLoad() {
            done();
          },
        };

        const vety = createVety({
          globalPlugins: [PluginToLoad],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
      });
    });

    it("GuildPlugin beforeUnload()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const beforeUnloadCalled = false;
        const PluginToUnload: GuildPluginBlueprint<GuildPluginData<BasePluginType>, any> = {
          name: "plugin-to-unload",
          configSchema: z.strictObject({}),

          afterLoad() {
            vety.client.emit("guildUnavailable", guild);
          },

          beforeUnload() {
            done();
          },
        };

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

    it("GlobalPlugin beforeUnload()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginToLoad: GlobalPluginBlueprint<GlobalPluginData<BasePluginType>, any> = {
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

          beforeUnload() {
            done();
          },
        };

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

    it("GuildPlugin afterUnload()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginToUnload: GuildPluginBlueprint<GuildPluginData<BasePluginType>, any> = {
          name: "plugin-to-unload",
          configSchema: z.strictObject({}),

          afterLoad() {
            vety.client.emit("guildUnavailable", guild);
          },

          afterUnload() {
            done();
          },
        };

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

    it("GlobalPlugin afterUnload()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginToLoad: GlobalPluginBlueprint<GlobalPluginData<BasePluginType>, any> = {
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

          afterUnload() {
            done();
          },
        };

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

    it("GuildPlugin afterLoad() runs after beforeLoad()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        let beforeLoadCalled = false;

        const PluginToLoad: GuildPluginBlueprint<GuildPluginData<BasePluginType>, any> = {
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

          beforeLoad() {
            beforeLoadCalled = true;
          },

          afterLoad() {
            assert.strictEqual(beforeLoadCalled, true);
            done();
          },
        };

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

    it("GlobalPlugin afterLoad() runs after beforeLoad()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        let beforeLoadCalled = false;

        const PluginToLoad: GlobalPluginBlueprint<GlobalPluginData<BasePluginType>, any> = {
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

          beforeLoad() {
            beforeLoadCalled = true;
          },

          afterLoad() {
            assert.strictEqual(beforeLoadCalled, true);
            done();
          },
        };

        const vety = createVety({
          globalPlugins: [PluginToLoad],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
      });
    });

    it("GuildPlugin beforeUnload() runs before afterUnload()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        let beforeUnloadCalled = false;

        const PluginToUnload: GuildPluginBlueprint<GuildPluginData<BasePluginType>, any> = {
          name: "plugin-to-unload",
          configSchema: z.strictObject({}),

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
        };

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

    it("GlobalPlugin beforeUnload() runs before afterUnload()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        let beforeUnloadCalled = false;

        const PluginToUnload: GlobalPluginBlueprint<GlobalPluginData<BasePluginType>, any> = {
          name: "plugin-to-unload",
          configSchema: z.strictObject({}),

          beforeUnload() {
            beforeUnloadCalled = true;
          },

          afterUnload() {
            assert.strictEqual(beforeUnloadCalled, true);
            done();
          },
        };

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

    it("hasPlugin() and getPlugin() are unavailable in GuildPlugin beforeLoad()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginToLoad: GuildPluginBlueprint<GuildPluginData<BasePluginType>, any> = {
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

          beforeLoad(pluginData) {
            assert.throws(() => pluginData.hasPlugin({} as AnyPluginBlueprint));
            assert.throws(() => pluginData.getPlugin({} as AnyPluginBlueprint));
            done();
          },
        };

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

    it("hasPlugin() and getPlugin() are unavailable in GlobalPlugin beforeLoad()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginToLoad: GlobalPluginBlueprint<GlobalPluginData<BasePluginType>, any> = {
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

          beforeLoad(pluginData) {
            assert.throws(() => pluginData.hasPlugin({} as AnyPluginBlueprint));
            assert.throws(() => pluginData.getPlugin({} as AnyPluginBlueprint));
            done();
          },
        };

        const vety = createVety({
          globalPlugins: [PluginToLoad],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
      });
    });

    it("hasPlugin() and getPlugin() are unavailable in GuildPlugin afterUnload()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginToUnload: GuildPluginBlueprint<GuildPluginData<BasePluginType>, any> = {
          name: "plugin-to-unload",
          configSchema: z.strictObject({}),

          afterLoad() {
            vety.client.emit("guildUnavailable", guild);
          },

          afterUnload(pluginData) {
            assert.throws(() => pluginData.hasPlugin({} as AnyPluginBlueprint));
            assert.throws(() => pluginData.getPlugin({} as AnyPluginBlueprint));
            done();
          },
        };

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

    it("hasPlugin() and getPlugin() are unavailable in GlobalPlugin afterUnload()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginToLoad: GlobalPluginBlueprint<GlobalPluginData<BasePluginType>, any> = {
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

          afterUnload(pluginData) {
            assert.throws(() => pluginData.hasPlugin({} as AnyPluginBlueprint));
            assert.throws(() => pluginData.getPlugin({} as AnyPluginBlueprint));
            done();
          },
        };

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

    it("GuildPlugin is unavailable to other plugins during afterUnload()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginWithPublicInterface = guildPlugin<BasePluginType>()({
          name: "plugin-with-public-interface",
          configSchema: z.strictObject({}),

          public() {
            return {};
          },
        });

        const PluginWithTests: GuildPluginBlueprint<GuildPluginData<BasePluginType>, any> = {
          name: "plugin-with-tests",
          configSchema: z.strictObject({}),
          dependencies: () => [PluginWithPublicInterface],
          afterLoad() {
            vety.client.emit("guildUnavailable", guild);
          },
          afterUnload(pluginData) {
            assert.throws(() => pluginData.getPlugin(PluginWithPublicInterface));
            done();
          },
        };

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

    it("GlobalPlugin is unavailable to other plugins during afterUnload()", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const PluginWithPublicInterface = globalPlugin<BasePluginType>()({
          name: "plugin-with-public-interface",
          configSchema: z.strictObject({}),

          public() {
            return {};
          },
        });

        const PluginWithTests: GlobalPluginBlueprint<GlobalPluginData<BasePluginType>, any> = {
          name: "plugin-with-tests",
          configSchema: z.strictObject({}),
          dependencies: () => [PluginWithPublicInterface],
          afterLoad() {
            void vety.destroy();
          },
          afterUnload(pluginData) {
            assert.throws(() => pluginData.getPlugin(PluginWithPublicInterface));
            done();
          },
        };

        const vety = createVety({
          globalPlugins: [PluginWithPublicInterface, PluginWithTests],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
      });
    });

    it("GuildPlugin hook order", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        let lastCalledHook: string | null = null;

        const PluginToLoad: GuildPluginBlueprint<GuildPluginData<BasePluginType>, any> = {
          name: "plugin-to-load",
          configSchema: z.strictObject({}),
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
        };

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

    it("GlobalPlugin hook order", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        let lastCalledHook: string | null = null;

        const PluginToLoad: GlobalPluginBlueprint<GlobalPluginData<BasePluginType>, any> = {
          name: "plugin-to-load",
          configSchema: z.strictObject({}),
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
        };

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
    it("hasPlugin", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const DependencyToLoad = guildPlugin({
          name: "dependency-to-load",
          configSchema: z.strictObject({}),
        });

        const SomeOtherPlugin = guildPlugin({
          name: "some-other-plugin",
          configSchema: z.strictObject({}),
        });

        const PluginToLoad = guildPlugin({
          name: "plugin-to-load",
          dependencies: () => [DependencyToLoad],
          configSchema: z.strictObject({}),

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

    it("getPlugin", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        interface DependencyPluginType extends BasePluginType {
          state: { value: number };
        }

        const DependencyToLoad = guildPlugin<DependencyPluginType>()({
          name: "dependency-to-load",
          configSchema: z.strictObject({}),

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

        const PluginToLoad = guildPlugin({
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

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

    it("hasGlobalPlugin", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const SomeGlobalPlugin = globalPlugin({
          name: "some-global-plugin",
          configSchema: z.strictObject({}),
          public() {
            return {
              works: () => true,
            };
          },
        });

        const SomeGuildPlugin = guildPlugin({
          name: "some-guild-plugin",
          configSchema: z.strictObject({}),

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

    it("getPlugin", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const SomeGlobalPlugin = globalPlugin({
          name: "some-global-plugin",
          configSchema: z.strictObject({}),
          public() {
            return {
              works: () => true,
            };
          },
        });

        const SomeGuildPlugin = guildPlugin({
          name: "some-guild-plugin",
          configSchema: z.strictObject({}),

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

    it("getPlugin has correct pluginData", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const DependencyToLoad = guildPlugin({
          name: "dependency-to-load",
          configSchema: z.strictObject({
            some_value: z.string().default("cookies"),
          }),

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

        const PluginToLoad = guildPlugin({
          name: "plugin-to-load",
          configSchema: z.strictObject({
            some_value: z.string().default("milk"),
          }),

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

    it("automatic dependency loading", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const DependencyToLoad = guildPlugin({
          name: "dependency-to-load",
          configSchema: z.strictObject({}),
        });

        const OtherDependencyToLoad = guildPlugin({
          name: "other-dependency-to-load",
          configSchema: z.strictObject({}),
        });

        const PluginToLoad = guildPlugin({
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

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

    it("transitive dependencies", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const DependencyTwo = guildPlugin({
          name: "dependency-two",
          configSchema: z.strictObject({}),
        });
        const DependencyOne = guildPlugin({
          name: "dependency-one",
          configSchema: z.strictObject({}),
          dependencies: () => [DependencyTwo],
        });

        const PluginToLoad = guildPlugin({
          name: "plugin-to-load",
          configSchema: z.strictObject({}),

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

    it("plugins loaded as dependencies do not load commands or events", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const Dependency = guildPlugin({
          name: "dependency",
          configSchema: z.strictObject({}),

          messageCommands: [guildPluginMessageCommand({ trigger: "foo", permission: null, run: noop })],
          events: [guildPluginEventListener({ event: "messageCreate", listener: noop })],

          afterLoad(pluginData) {
            // The command above should *not* be loaded
            assert.strictEqual(pluginData.messageCommands.getAll().length, 0);
            // The event listener above should *not* be loaded, and neither should the default message listener
            assert.strictEqual(pluginData.events.getListenerCount(), 0);

            done();
          },
        });

        const PluginToLoad = guildPlugin({
          name: "plugin-to-load",
          configSchema: z.strictObject({}),
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
    it("Synchronous custom overrides", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        let commandTriggers = 0;

        interface PluginType extends BasePluginType {
          customOverrideCriteria: {
            myUserOverride: string;
          };
        }

        const TestPlugin = guildPlugin<PluginType>()({
          name: "test-plugin",
          configSchema: z.strictObject({
            can_do: z.boolean().default(false),
          }),

          customOverrideCriteriaFunctions: {
            myUserOverride: (pluginData, matchParams, value) => matchParams.userId === value,
          },

          messageCommands: [
            guildPluginMessageCommand({
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

    it("Asynchronous custom overrides", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        let commandTriggers = 0;

        interface PluginType extends BasePluginType {
          customOverrideCriteria: {
            myAsyncUserOverride: string;
          };
        }

        const TestPlugin = guildPlugin<PluginType>()({
          name: "test-plugin",
          configSchema: z.strictObject({
            can_do: z.boolean().default(false),
          }),

          customOverrideCriteriaFunctions: {
            myAsyncUserOverride: async (pluginData, matchParams, value) => {
              await sleep(5);
              return matchParams.userId === value;
            },
          },

          messageCommands: [
            guildPluginMessageCommand({
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
    it("Custom argument types", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const types = {
          foo: (value, ctx) => {
            return `${value}-${ctx.pluginData.guild.id}`;
          },
        };

        const TestPlugin = guildPlugin({
          name: "test-plugin",
          configSchema: z.strictObject({}),

          messageCommands: [
            guildPluginMessageCommand({
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
    it("pluginData contains everything (guild plugin)", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const TestPlugin: GuildPluginBlueprint<GuildPluginData<BasePluginType>, any> = {
          name: "test-plugin",
          configSchema: z.strictObject({}),

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
        };

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

    it("pluginData contains everything (global plugin)", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        const TestPlugin: GlobalPluginBlueprint<GlobalPluginData<BasePluginType>, any> = {
          name: "test-plugin",
          configSchema: z.strictObject({}),

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
        };

        const vety = createVety({
          globalPlugins: [TestPlugin],
          options: {
            logFn: noop,
          },
        });
        await initializeVety(vety);
      });
    });

    it("event handlers are unloaded on plugin unload", (mochaDone) => {
      withVety(mochaDone, async (createVety, done) => {
        let msgEvFnCallNum = 0;

        const messageEv = guildPluginEventListener({
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

        const PluginToUnload: GuildPluginBlueprint<GuildPluginData<BasePluginType>, any> = {
          name: "plugin-to-unload",
          configSchema: z.strictObject({}),
          events: [messageEv],
          afterLoad() {
            const msg = createMockMessage(vety.client, textChannel, author, { content: "hi!" });
            vety.client.emit("messageCreate", msg);
          },
        };

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

  describe("plugin() helper", () => {
    it("(blueprint)", () => {
      const blueprint = guildPlugin({
        name: "my-plugin",
        configSchema: z.strictObject({}),
      });

      expect(blueprint.name).to.equal("my-plugin");
    });

    interface CustomPluginType extends BasePluginType {
      state: {
        foo: 5;
      };
    }

    it("<TPluginType>()(blueprint)", () => {
      const blueprint = guildPlugin<CustomPluginType>()({
        name: "my-plugin",
        configSchema: z.strictObject({}),

        beforeLoad(pluginData) {
          const typeCheck: AssertEquals<typeof pluginData, GuildPluginData<CustomPluginType>> = true;
        },
        afterLoad(pluginData) {
          const typeCheck: AssertEquals<typeof pluginData, GuildPluginData<CustomPluginType>> = true;
        },
      });

      expect(blueprint.name).to.equal("my-plugin");
    });
  });

  describe("Public interfaces", () => {
    it("Public interface type inference works", () => {
      interface OtherPluginType extends BasePluginType {
        state: {
          foo: 5;
        };
      }

      const OtherPlugin = guildPlugin<OtherPluginType>()({
        name: "other-plugin",
        configSchema: z.strictObject({}),

        public(pluginData) {
          return {
            myFn(param: "a constant string") {
              const result: AssertEquals<typeof pluginData.state.foo, OtherPluginType["state"]["foo"]> = true;
            },
          };
        },
      });

      const MainPlugin = guildPlugin({
        name: "main-plugin",
        configSchema: z.strictObject({}),

        afterLoad(pluginData) {
          const otherPlugin = pluginData.getPlugin(OtherPlugin);

          const result: AssertEquals<Parameters<typeof otherPlugin.myFn>[0], "a constant string"> = true;
        },
      });
    });

    // Note: public interface *functionality* is already tested by Dependencies#getPlugin above
  });
});
