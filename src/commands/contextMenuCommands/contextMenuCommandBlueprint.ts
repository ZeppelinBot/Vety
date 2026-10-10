import type {
  Locale,
  MessageContextMenuCommandInteraction,
  Permissions,
  UserContextMenuCommandInteraction,
} from "discord.js";
import type { AnyPluginData } from "../../plugins/PluginData.ts";

export interface BaseContextMenuCommandBlueprint {
  name: string;
  nameLocalizations?: Record<Locale, string>;
  descriptionLocalizations?: Record<Locale, string>;
  defaultMemberPermissions?: Permissions;
  configPermission?: string;
  allowDms?: boolean;
}

// MESSAGE CONTEXT MENU COMMANDS

export interface MessageContextMenuCommandBlueprint<
  TPluginData extends AnyPluginData<any>,
> extends BaseContextMenuCommandBlueprint {
  type: "message-context-menu";
  run: (meta: MessageContextMenuCommandMeta<TPluginData>) => void | Promise<void>;
}

export type MessageContextMenuCommandMeta<TPluginData extends AnyPluginData<any>> = {
  pluginData: TPluginData;
  interaction: MessageContextMenuCommandInteraction;
};

// USER CONTEXT MENU COMMANDS

export interface UserContextMenuCommandBlueprint<
  TPluginData extends AnyPluginData<any>,
> extends BaseContextMenuCommandBlueprint {
  type: "user-context-menu";
  run: (meta: UserContextMenuCommandMeta<TPluginData>) => void | Promise<void>;
}

export type UserContextMenuCommandMeta<TPluginData extends AnyPluginData<any>> = {
  pluginData: TPluginData;
  interaction: UserContextMenuCommandInteraction;
};
