export interface BasePluginType {
  configInput: any;
  configOutput: any;
  customOverrideCriteria: Record<string, unknown>;
  customOverrideMatchParams: Record<string, unknown>;
  state: any;
}
