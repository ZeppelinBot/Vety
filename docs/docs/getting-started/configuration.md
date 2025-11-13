---
sidebar_position: 4
---

# Configuration

When you construct a `Vety` instance you provide the list of plugins and an `options` object that controls global
behaviour. Every option is optional; Vety falls back to sensible defaults.

```ts
import { Vety } from "vety";

const vety = new Vety(client, {
  guildPlugins: [],
  globalPlugins: [],
  options: {
    autoRegisterApplicationCommands: true,
    async getConfig(id) {
      if (id === "global") {
        return loadGlobalConfig();
      }
      return loadGuildConfig(id);
    },
    async getEnabledGuildPlugins(ctx, guildPlugins) {
      // Enable every known plugin by default
      return Array.from(guildPlugins.keys());
    },
    async canLoadGuild(guildId) {
      return true;
    },
    concurrentGuildLoadLimit: 10,
    customArgumentTypes: {},
    logFn(level, ...args) {
      console[level === "error" ? "error" : "log"]("[Vety]", level, ...args);
    },
  },
});
```

## Option reference

| Option | Default | Description |
| --- | --- | --- |
| `autoRegisterApplicationCommands` | `true` | Automatically (re)register slash and context menu commands on startup. Set to `false` if you manage registration yourself. |
| `getConfig(id)` | Required | Returns the configuration object for a guild (`id` is the guild ID) or for the global context (`id === "global"`). The result can be synchronous or a promise. |
| `getEnabledGuildPlugins(ctx, guildPlugins)` | Enable all | Returns an array of plugin names that should load for the guild. Use the provided `ctx` to inspect guild config before deciding. |
| `canLoadGuild(guildId)` | Always load | Determines whether Vety should load the guild at all. Useful for shard partitioning or maintenance windows. |
| `customArgumentTypes` | `{}` | Map of additional argument parsers available to message commands. Keys are argument names referenced in command signatures. |
| `concurrentGuildLoadLimit` | `10` | Maximum number of guilds Vety is allowed to load in parallel at startup. |
| `logFn(level, ...args)` | Built-in logger | Hook for piping Vety’s internal logging into your logging framework. Levels are `info`, `warn`, and `error`. |

You can also freely include any other values in the options object; Vety will ignore keys it does not recognise. This is
handy when you want to pass shared configuration down to multiple plugins during construction.

## Configuration workflow recap

1. Instantiate Vety with your plugins and options.
2. Call `vety.initialize()` and connect your Discord client.
3. Vety invokes `getConfig("global")` and loads global plugins.
4. For each guild it is allowed to load, Vety calls `getConfig(guildId)` followed by `getEnabledGuildPlugins(ctx, plugins)`.
5. The returned configuration is validated against each plugin‟s `configSchema` and exposed via `pluginData.config`.

Refer to [Plugin configuration](../plugins/plugin-configuration.md) for the structure Vety expects `getConfig` to
return.
