import type { AnyPluginType, PluginType } from "#/plugins/pluginType";
import { z, type ZodType } from "zod";
import type {
  MessageContextMenuCommandBlueprint,
  UserContextMenuCommandBlueprint,
} from "../commands/contextMenuCommands/contextMenuCommandBlueprint.ts";
import type { MessageCommandBlueprint } from "../commands/messageCommands/messageCommandBlueprint.ts";
import type {
  AnySlashCommandSignature,
  SlashCommandBlueprint,
} from "../commands/slashCommands/slashCommandBlueprint.ts";
import type { SlashGroupBlueprint } from "../commands/slashCommands/slashGroupBlueprint.ts";
import type { CustomOverrideCriteriaFunctions, PluginOverride } from "../config/configTypes.ts";
import type { EventListenerBlueprint } from "../events/EventListenerBlueprint.ts";
import type { GuildEvent } from "../events/eventTypes.ts";
import type { Awaitable } from "../utils.ts";
import type { GuildPluginData } from "./PluginData.ts";

type AnyFn = (...args: any[]) => any;

export type AnyGuildPluginBlueprint = GuildPluginBlueprint<AnyPluginType, any>;

export interface GuildPluginBlueprint<PluginType extends AnyPluginType, PublicInterface extends Record<string, AnyFn>> {
  /**
   * **[Required]** Internal name for the plugin
   */
  name: string;

  /**
   * Function that returns other plugins that are required for this plugin to function.
   * They will be loaded before this plugin.
   */
  dependencies?: () => Array<GuildPluginBlueprint<any, any>> | Promise<Array<GuildPluginBlueprint<any, any>>>;

  defaultOverrides?: Array<PluginOverride<PluginType>>;

  configSchema: ZodType<PluginType["configOutput"], PluginType["configInput"]>;

  messageCommands?: Array<MessageCommandBlueprint<GuildPluginData<PluginType>, any>>;

  slashCommands?: Array<
    | SlashCommandBlueprint<GuildPluginData<PluginType>, AnySlashCommandSignature>
    | SlashGroupBlueprint<GuildPluginData<PluginType>>
  >;

  contextMenuCommands?: Array<
    | MessageContextMenuCommandBlueprint<GuildPluginData<PluginType>>
    | UserContextMenuCommandBlueprint<GuildPluginData<PluginType>>
  >;

  /**
   * Event listeners that are automatically registered on plugin load
   */
  events?: Array<AnyGuildEventListenerBlueprint<PluginType>>;

  /**
   * If this plugin includes any custom overrides, these functions evaluate them
   */
  customOverrideCriteriaFunctions?: CustomOverrideCriteriaFunctions<GuildPluginData<PluginType>>;

  /**
   * Public interface for this plugin
   */
  public?: (pluginData: GuildPluginData<PluginType>) => PublicInterface;

  /**
   * This hook is called before the plugin is loaded.
   *
   * Guarantees:
   * 1. Other plugins can't yet interact with this plugin's public interface
   * 2. `PluginData.hasPlugin()` and `PluginData.getPlugin()` are unavailable
   */
  beforeLoad?: (pluginData: GuildPluginData<PluginType>) => Awaitable<void>;

  /**
   * This hook is called after each plugin's pluginData has been set up,
   * but before any event listeners or commands are loaded.
   *
   * Guarantees:
   * 1. Other plugins are able to interact with this plugin's public interfaces
   *     - If you need to set up dependencies for your public interface, do it in the `beforeLoad()` hook
   * 2. Commands and event handlers have NOT been registered yet
   */
  beforeStart?: (pluginData: GuildPluginData<PluginType>) => Awaitable<void>;

  /**
   * This hook is called after the plugin has been loaded.
   *
   * Guarantees:
   * 1. Commands and event handlers are already registered
   *     * If you need to set up dependencies for your commands or event handlers, do it in the `beforeStart()` hook
   * 2. Other plugins are able to interact with this plugin's public interfaces
   */
  afterLoad?: (pluginData: GuildPluginData<PluginType>) => Awaitable<void>;

  /**
   * This hook is called before the plugin is unloaded.
   *
   * Guarantees:
   * 1. Commands and event handlers are still registered.
   *     * If you need to unload dependencies for your commands or event handlers, do it in the `afterUnload()` hook
   * 2. Other plugins are still able to interact with this plugin's public interfaces
   *     * If you want to unload your public interface's dependencies, do it in the `afterUnload()` hook
   */
  beforeUnload?: (pluginData: GuildPluginData<PluginType>) => Awaitable<void>;

  /**
   * This hook is called after the plugin has been unloaded.
   *
   * Guarantees:
   * 1. Other plugins can no longer interact with this plugin's public interface
   * 2. `PluginData.hasPlugin()` and `PluginData.getPlugin()` are unavailable
   */
  afterUnload?: (pluginData: GuildPluginData<PluginType>) => Awaitable<void>;
}

/**
 * This is used in conjunction with arr[keyof arr] syntax in AnyGuildEventListenerBlueprint to create
 * a union type of event listener blueprints for each different guild event.
 *
 * We can't simply do EventListenerBlueprint<GuildPluginData<TPluginType>, GuildEvent>, because then adding
 * an event listener blueprint for a single event isn't valid in TS strict mode anymore, as technically that specific
 * event listener blueprint doesn't accept *every* GuildEvent, just the specific one.
 */
type GuildEventListenerBlueprintsHelper<PluginType extends AnyPluginType> = {
  [K in GuildEvent]: EventListenerBlueprint<GuildPluginData<PluginType>, K>;
};

export type AnyGuildEventListenerBlueprint<PluginType extends AnyPluginType> =
  GuildEventListenerBlueprintsHelper<PluginType>[keyof GuildEventListenerBlueprintsHelper<PluginType>];

export function guildPluginContract<
  ConfigSchema extends ZodType,
  StateSchema extends ZodType = ZodType<any, any>,
  CustomOverrideCriteriaSchema extends ZodType<Record<string, unknown>, any> = ZodType<any, any>,
  CustomOverrideMatchParamsSchema extends ZodType<Record<string, unknown>, any> = ZodType<any, any>,
>(definition: {
  configSchema: ConfigSchema;
  stateSchema?: StateSchema;
  customOverrideCriteriaSchema?: CustomOverrideCriteriaSchema;
  customOverrideMatchParamsSchema?: CustomOverrideMatchParamsSchema;
}) {
  return {
    plugin(blueprint) {
      return {
        ...blueprint,
        configSchema: definition.configSchema,
      };
    },

    messageCommand(blueprint) {
      return {
        ...blueprint,
        type: "message",
      };
    },

    slashCommand(blueprint) {
      return {
        ...blueprint,
        type: "slash",
      };
    },

    slashGroup(blueprint) {
      return {
        ...blueprint,
        type: "slash-group",
      };
    },

    messageContextMenuCommand(blueprint) {
      return {
        ...blueprint,
        type: "message-context-menu",
      };
    },

    userContextMenuCommand(blueprint) {
      return {
        ...blueprint,
        type: "user-context-menu",
      };
    },

    eventListener(blueprint) {
      return blueprint;
    },
  } as GuildPluginContract<
    PluginType<
      z.input<ConfigSchema>,
      z.output<ConfigSchema>,
      z.output<StateSchema>,
      z.output<CustomOverrideCriteriaSchema>,
      z.output<CustomOverrideMatchParamsSchema>
    >
  >;
}

export interface GuildPluginContract<PluginType extends AnyPluginType> {
  plugin: <PublicInterface extends Record<string, AnyFn>>(
    blueprint: Omit<GuildPluginBlueprint<PluginType, PublicInterface>, "configSchema">,
  ) => GuildPluginBlueprint<PluginType, PublicInterface>;

  messageCommand: <Blueprint extends Omit<MessageCommandBlueprint<GuildPluginData<PluginType>, any>, "type">>(
    blueprint: Blueprint,
  ) => MessageCommandBlueprint<GuildPluginData<PluginType>, any>;

  slashCommand: <
    Blueprint extends Omit<SlashCommandBlueprint<GuildPluginData<PluginType>, AnySlashCommandSignature>, "type">,
  >(
    blueprint: Blueprint,
  ) => SlashCommandBlueprint<GuildPluginData<PluginType>, AnySlashCommandSignature>;

  slashGroup: <Blueprint extends Omit<SlashGroupBlueprint<GuildPluginData<PluginType>>, "type">>(
    blueprint: Blueprint,
  ) => SlashGroupBlueprint<GuildPluginData<PluginType>>;

  messageContextMenuCommand: <
    Blueprint extends Omit<MessageContextMenuCommandBlueprint<GuildPluginData<PluginType>>, "type">,
  >(
    blueprint: Blueprint,
  ) => MessageContextMenuCommandBlueprint<GuildPluginData<PluginType>>;

  userContextMenuCommand: <
    Blueprint extends Omit<UserContextMenuCommandBlueprint<GuildPluginData<PluginType>>, "type">,
  >(
    blueprint: Blueprint,
  ) => UserContextMenuCommandBlueprint<GuildPluginData<PluginType>>;

  eventListener: (blueprint: AnyGuildEventListenerBlueprint<PluginType>) => AnyGuildEventListenerBlueprint<PluginType>;
}
