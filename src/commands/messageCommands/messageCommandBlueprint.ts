import type { AnyPluginData, GlobalPluginData, GuildPluginData } from "../../plugins/PluginData.ts";
import type { AnyPluginType } from "../../plugins/pluginType.ts";
import type { CommandFn, MessageCommandSignatureOrArray, PluginCommandConfig } from "./messageCommandUtils.ts";

type CommandSource = "guild" | "dm";

export interface MessageCommandBlueprint<
  TPluginData extends AnyPluginData<any>,
  _TSignature extends MessageCommandSignatureOrArray<TPluginData["_pluginType"]>,
> {
  type: "message";

  trigger: string | string[];
  signature?: _TSignature;
  run: CommandFn<TPluginData, _TSignature>;
  config?: PluginCommandConfig;

  // Required permission name
  permission: string | null;

  // Restrict the source of the command. Defaults to guild messages only.
  source?: CommandSource | CommandSource[];

  // Locks to wait for before running the command, and to acquire for the duration of the command
  locks?: string | string[];

  // Command cooldown. Time is in milliseconds.
  cooldown?:
    | number
    | {
        amount: number;
        permission: string;
      };

  // Description of the command
  description?: string;

  // Usage information for the command
  usage?: string;
}
