export interface PluginType<
  ConfigInput,
  ConfigOutput,
  State,
  CustomOverrideCriteria extends Record<string, unknown>,
  CustomOverrideMatchParams extends Record<string, unknown>,
> {
  configInput: ConfigInput;
  configOutput: ConfigOutput;
  state: State;
  customOverrideCriteria: CustomOverrideCriteria;
  customOverrideMatchParams: CustomOverrideMatchParams;
}

export type AnyPluginType = PluginType<any, any, any, any, any>;
