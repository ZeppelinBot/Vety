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
import type { ValidEvent } from "../events/eventTypes.ts";
import type { Awaitable } from "../utils.ts";
import type { GlobalPluginData } from "./PluginData.ts";

type AnyFn = (...args: any[]) => any;

export type AnyGlobalPluginBlueprint = GlobalPluginBlueprint<AnyPluginType, any>;

export interface GlobalPluginBlueprint<
  PluginType extends AnyPluginType,
  PublicInterface extends Record<string, AnyFn>,
> {
  /**
   * **[Required]** Internal name for the plugin
   */
  name: string;

  /**
   * Function that returns other plugins that are required for this plugin to function.
   * They will be loaded before this plugin.
   */
  dependencies?: () => Array<GlobalPluginBlueprint<any, any>> | Promise<Array<GlobalPluginBlueprint<any, any>>>;

  defaultOverrides?: Array<PluginOverride<PluginType>>;

  configSchema: ZodType<PluginType["configOutput"], PluginType["configInput"]>;

  messageCommands?: Array<MessageCommandBlueprint<GlobalPluginData<PluginType>, any>>;

  slashCommands?: Array<
    | SlashCommandBlueprint<GlobalPluginData<PluginType>, AnySlashCommandSignature>
    | SlashGroupBlueprint<GlobalPluginData<PluginType>>
  >;

  contextMenuCommands?: Array<
    | MessageContextMenuCommandBlueprint<GlobalPluginData<PluginType>>
    | UserContextMenuCommandBlueprint<GlobalPluginData<PluginType>>
  >;

  /**
   * Event listeners that are automatically registered on plugin load
   */
  events?: Array<AnyGlobalEventListenerBlueprint<PluginType>>;

  /**
   * If this plugin includes any custom overrides, these functions evaluate them
   */
  customOverrideCriteriaFunctions?: CustomOverrideCriteriaFunctions<GlobalPluginData<PluginType>>;

  /**
   * Public interface for this plugin
   */
  public?: (pluginData: GlobalPluginData<PluginType>) => PublicInterface;

  /**
   * This hook is called before the plugin is loaded.
   *
   * Guarantees:
   * 1. Other plugins can't yet interact with this plugin's public interface
   * 2. `PluginData.hasPlugin()` and `PluginData.getPlugin()` are unavailable
   */
  beforeLoad?: (pluginData: GlobalPluginData<PluginType>) => Awaitable<void>;

  /**
   * This hook is called after each plugin's pluginData has been set up,
   * but before any event listeners or commands are loaded.
   *
   * Guarantees:
   * 1. Other plugins are able to interact with this plugin's public interfaces
   *     - If you need to set up dependencies for your public interface, do it in the `beforeLoad()` hook
   * 2. Commands and event handlers have NOT been registered yet
   */
  beforeStart?: (pluginData: GlobalPluginData<PluginType>) => Awaitable<void>;

  /**
   * This hook is called after the plugin has been loaded.
   *
   * Guarantees:
   * 1. Commands and event handlers are already registered
   *     * If you need to set up dependencies for your commands or event handlers, do it in the `beforeStart()` hook
   * 2. Other plugins are able to interact with this plugin's public interfaces
   */
  afterLoad?: (pluginData: GlobalPluginData<PluginType>) => Awaitable<void>;

  /**
   * This hook is called before the plugin is unloaded.
   *
   * Guarantees:
   * 1. Commands and event handlers are still registered.
   *     * If you need to unload dependencies for your commands or event handlers, do it in the `afterUnload()` hook
   * 2. Other plugins are still able to interact with this plugin's public interfaces
   *     * If you want to unload your public interface's dependencies, do it in the `afterUnload()` hook
   */
  beforeUnload?: (pluginData: GlobalPluginData<PluginType>) => Awaitable<void>;

  /**
   * This hook is called after the plugin has been unloaded.
   *
   * Guarantees:
   * 1. Other plugins can no longer interact with this plugin's public interface
   * 2. `PluginData.hasPlugin()` and `PluginData.getPlugin()` are unavailable
   */
  afterUnload?: (pluginData: GlobalPluginData<PluginType>) => Awaitable<void>;
}

/**
 * This is used in conjunction with arr[keyof arr] syntax in AnyGlobalEventListenerBlueprint to create
 * a union type of event listener blueprints for each different global event (i.e. each ValidEvent).
 *
 * We can't simply do EventListenerBlueprint<GlobalPluginData<TPluginType>, ValidEvent>, because then adding
 * an event listener blueprint for a single event isn't valid in TS strict mode anymore, as technically that specific
 * event listener blueprint doesn't accept *every* ValidEvent, just the specific one.
 */
type GlobalEventListenerBlueprintsHelper<PluginType extends AnyPluginType> = {
  [K in ValidEvent]: EventListenerBlueprint<GlobalPluginData<PluginType>, K>;
};

export type AnyGlobalEventListenerBlueprint<PluginType extends AnyPluginType> =
  GlobalEventListenerBlueprintsHelper<PluginType>[keyof GlobalEventListenerBlueprintsHelper<PluginType>];

export function globalPluginContract<
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
  } as GlobalPluginContract<
    PluginType<
      z.input<ConfigSchema>,
      z.output<ConfigSchema>,
      z.output<StateSchema>,
      z.output<CustomOverrideCriteriaSchema>,
      z.output<CustomOverrideMatchParamsSchema>
    >
  >;
}

export interface GlobalPluginContract<PluginType extends AnyPluginType> {
  plugin: <PublicInterface extends Record<string, AnyFn>>(
    blueprint: Omit<GlobalPluginBlueprint<PluginType, PublicInterface>, "configSchema">,
  ) => GlobalPluginBlueprint<PluginType, PublicInterface>;

  messageCommand: <Blueprint extends Omit<MessageCommandBlueprint<GlobalPluginData<PluginType>, any>, "type">>(
    blueprint: Blueprint,
  ) => MessageCommandBlueprint<GlobalPluginData<PluginType>, any>;

  slashCommand: <
    Blueprint extends Omit<SlashCommandBlueprint<GlobalPluginData<PluginType>, AnySlashCommandSignature>, "type">,
  >(
    blueprint: Blueprint,
  ) => SlashCommandBlueprint<GlobalPluginData<PluginType>, AnySlashCommandSignature>;

  slashGroup: <Blueprint extends Omit<SlashGroupBlueprint<GlobalPluginData<PluginType>>, "type">>(
    blueprint: Blueprint,
  ) => SlashGroupBlueprint<GlobalPluginData<PluginType>>;

  messageContextMenuCommand: <
    Blueprint extends Omit<MessageContextMenuCommandBlueprint<GlobalPluginData<PluginType>>, "type">,
  >(
    blueprint: Blueprint,
  ) => MessageContextMenuCommandBlueprint<GlobalPluginData<PluginType>>;

  userContextMenuCommand: <
    Blueprint extends Omit<UserContextMenuCommandBlueprint<GlobalPluginData<PluginType>>, "type">,
  >(
    blueprint: Blueprint,
  ) => UserContextMenuCommandBlueprint<GlobalPluginData<PluginType>>;

  eventListener: (
    blueprint: AnyGlobalEventListenerBlueprint<PluginType>,
  ) => AnyGlobalEventListenerBlueprint<PluginType>;
}
