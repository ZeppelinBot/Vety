import type { AnyGlobalPluginBlueprint } from "#/plugins/GlobalPlugin";
import type { AnyGuildPluginBlueprint } from "#/plugins/GuildPlugin";

export type AnyPluginBlueprint = AnyGuildPluginBlueprint | AnyGlobalPluginBlueprint;
