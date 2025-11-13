---
sidebar_position: 3
---

# Basic usage

```ts
import { Client, GatewayIntentBits } from "discord.js";
import { Vety, guildPlugin, guildPluginSlashCommand, slashOptions } from "vety";
import z from "zod";

// Create a command
const echoCommand = guildPluginSlashCommand({
  name: "echo",
  description: "Repeats what you say",
  signature: [
    slashOptions.string({ name: "text", description: "The text to repeat", required: true }),
  ],
  run({ interaction, options }) {
    interaction.reply(options.text);
  },
});

// Create a plugin and give it the command
const myPlugin = guildPlugin({
  name: "my-plugin",
  configSchema: z.strictObject({}),
  slashCommands: [
    echoCommand,
  ],
});

// Create a discord.js client
const djsClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ],
});

// Tie it all together with Vety
const vety = new Vety(djsClient, {
  guildPlugins: [
    myPlugin,
  ],
});

// Initialize Vety and connect to the bot gateway
vety.initialize();
djsClient.login("YOUR TOKEN HERE");
```
