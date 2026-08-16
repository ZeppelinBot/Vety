import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { z } from "zod";
import type { PluginOptions } from "../index.ts";
import type { GuildPluginData } from "../plugins/PluginData.ts";
import type { BasePluginType } from "../plugins/pluginTypes.ts";
import { sleep } from "../testUtils.ts";
import type { CustomOverrideCriteriaFunctions } from "./configTypes.ts";
import { getMatchingPluginConfig, mergeConfig } from "./configUtils.ts";

describe("configUtils", () => {
  describe("mergeConfig", () => {
    const base = {
      foo: 1,
      bar: {
        baz: 2,
        qux: 3,
      },
      simpleArr: [1, 2],
      addArr: [1, 2],
      subArr: [1, 2],
    };

    const override = {
      foo: 2,
      bar: {
        baz: 5,
        quux: 10,
      },
      simpleArr: ["a", "b"],
      "+addArr": [3],
      "-subArr": [1],
    };

    const result: any = mergeConfig<any>(base, override);

    it("should overwrite scalar values", () => {
      assert.strictEqual(result.foo, 2);
    });

    it("should overwrite nested scalar values", () => {
      assert.strictEqual(result.bar.baz, 5);
    });

    it("should merge objects instead of overwriting them", () => {
      assert.strictEqual(result.bar.qux, 3);
      assert.strictEqual(result.bar.quux, 10);
    });

    it("should overwrite arrays", () => {
      assert.deepStrictEqual(result.simpleArr, ["a", "b"]);
    });

    it("should not support adding to arrays anymore", () => {
      assert.deepStrictEqual(result.addArr, [1, 2]);
    });

    it("should not support removing from arrays anymore", () => {
      assert.deepStrictEqual(result.addArr, [1, 2]);
    });
  });

  describe("getMatchingPluginConfig", () => {
    const sharedConfigSchema = z.strictObject({
      value: z.number().default(5),
      hasAccess: z.boolean().default(false),
    });
    interface SharedPluginType extends BasePluginType {
      configSchema: typeof sharedConfigSchema;
    }

    const sharedPluginOptions: PluginOptions<SharedPluginType> = {
      config: sharedConfigSchema.parse({}), // Defaults
      overrides: [
        {
          level: ">=20",
          config: {
            hasAccess: true,
          },
        },
        {
          level: [">=30", "<40"],
          config: {
            hasAccess: false,
          },
        },
        {
          level: [],
          config: {
            value: 50,
          },
        },
        {
          channel: ["1100", "1200"],
          config: {
            value: 10,
          },
        },
        {
          user: "2100",
          config: {
            value: 15,
          },
        },
        {
          role: ["3100", "3200"],
          config: {
            value: 20,
          },
        },
        {
          channel: "1100",
          role: "3100",
          config: {
            value: 25,
          },
        },
        {
          category: ["9100", "9200"],
          config: {
            value: 120,
          },
        },
      ],
    };

    it("should use defaults with empty match params", async () => {
      const matchedConfig = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: sharedPluginOptions,
        matchParams: {},
      });
      assert.strictEqual(matchedConfig.value, 5);
      assert.strictEqual(matchedConfig.hasAccess, false);
    });

    it("should match levels", async () => {
      const matchedConfig = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: sharedPluginOptions,
        matchParams: {
          level: 60,
        },
      });
      assert.strictEqual(matchedConfig.hasAccess, true);
    });

    it("should require all level conditions to apply", async () => {
      const matchedConfig = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: sharedPluginOptions,
        matchParams: {
          level: 35,
        },
      });
      assert.strictEqual(matchedConfig.hasAccess, false);
    });

    it("should match channels and accept any specified channel", async () => {
      const matchedConfig1 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: sharedPluginOptions,
        matchParams: {
          channelId: "1100",
        },
      });
      const matchedConfig2 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: sharedPluginOptions,
        matchParams: {
          channelId: "1200",
        },
      });
      assert.strictEqual(matchedConfig1.value, 10);
      assert.strictEqual(matchedConfig2.value, 10);
    });

    it("should match categories and accept any specified category", async () => {
      const matchedConfig1 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: sharedPluginOptions,
        matchParams: {
          categoryId: "9100",
        },
      });
      const matchedConfig2 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: sharedPluginOptions,
        matchParams: {
          categoryId: "9200",
        },
      });
      assert.strictEqual(matchedConfig1.value, 120);
      assert.strictEqual(matchedConfig2.value, 120);
    });

    it("should match users", async () => {
      const matchedConfig = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: sharedPluginOptions,
        matchParams: {
          userId: "2100",
        },
      });
      assert.strictEqual(matchedConfig.value, 15);
    });

    it("should match roles", async () => {
      const matchedConfig1 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: sharedPluginOptions,
        matchParams: {
          memberRoles: ["3100"],
        },
      });
      const matchedConfig2 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: sharedPluginOptions,
        matchParams: {
          memberRoles: ["3100", "3200"],
        },
      });
      assert.strictEqual(matchedConfig1.value, 5); // has 3100 but no 3200 -> no match
      assert.strictEqual(matchedConfig2.value, 20); // has 3100 and 3200 -> match
    });

    it("custom override criteria", async () => {
      const customConfigSchema = z.strictObject({
        value: z.number().default(5),
      });
      interface CustomPluginType extends BasePluginType {
        configSchema: typeof customConfigSchema;
        customOverrideCriteria: {
          bestPlant?: string;
          worstPlant?: string;
        };
        customOverrideMatchParams: {
          plantsInPreferenceOrder?: string[];
        };
      }

      const customPluginOptions: PluginOptions<CustomPluginType> = {
        config: customConfigSchema.parse({}), // Defaults
        overrides: [
          {
            extra: {
              bestPlant: "ficus",
            },
            config: {
              value: 10,
            },
          },
          {
            extra: {
              bestPlant: "daisy",
            },
            config: {
              value: 20,
            },
          },
          {
            extra: {
              bestPlant: "rose",
              worstPlant: "pine",
            },
            config: {
              value: 30,
            },
          },
        ],
      };

      const first = <T>(arr: T[] | undefined): T | undefined => (arr ? arr[0] : undefined);
      const last = <T>(arr: T[] | undefined): T | undefined => (arr?.length ? arr[arr.length - 1] : undefined);
      const customOverrideCriteriaFunctions: CustomOverrideCriteriaFunctions<GuildPluginData<CustomPluginType>> = {
        bestPlant: (pluginData, matchParams, value) => first(matchParams.extra?.plantsInPreferenceOrder) === value,
        worstPlant: (pluginData, matchParams, value) => last(matchParams.extra?.plantsInPreferenceOrder) === value,
      };

      const matchedConfig1 = await getMatchingPluginConfig<CustomPluginType, GuildPluginData<CustomPluginType>>({
        configSchema: customConfigSchema,
        pluginData: null as any,
        pluginOptions: customPluginOptions,
        matchParams: {
          extra: {
            plantsInPreferenceOrder: ["ficus", "daisy", "rose", "pine"],
          },
        },
        customOverrideCriteriaFunctions,
      });
      const matchedConfig2 = await getMatchingPluginConfig<CustomPluginType, GuildPluginData<CustomPluginType>>({
        configSchema: customConfigSchema,
        pluginData: null as any,
        pluginOptions: customPluginOptions,
        matchParams: {
          extra: {
            plantsInPreferenceOrder: ["daisy", "ficus", "rose", "pine"],
          },
        },
        customOverrideCriteriaFunctions,
      });
      const matchedConfig3 = await getMatchingPluginConfig<CustomPluginType, GuildPluginData<CustomPluginType>>({
        configSchema: customConfigSchema,
        pluginData: null as any,
        pluginOptions: customPluginOptions,
        matchParams: {
          extra: {
            plantsInPreferenceOrder: ["pine", "daisy", "rose", "ficus"],
          },
        },
        customOverrideCriteriaFunctions,
      });
      const matchedConfig4 = await getMatchingPluginConfig<CustomPluginType, GuildPluginData<CustomPluginType>>({
        configSchema: customConfigSchema,
        pluginData: null as any,
        pluginOptions: customPluginOptions,
        matchParams: {
          extra: {
            plantsInPreferenceOrder: ["rose", "daisy", "ficus", "pine"],
          },
        },
        customOverrideCriteriaFunctions,
      });

      assert.strictEqual(matchedConfig1.value, 10);
      assert.strictEqual(matchedConfig2.value, 20);
      assert.strictEqual(matchedConfig3.value, 5);
      assert.strictEqual(matchedConfig4.value, 30);
    });

    it("custom async override criteria", async () => {
      const customConfigSchema = z.strictObject({
        value: z.number().default(5),
      });
      interface CustomPluginType extends BasePluginType {
        configSchema: typeof customConfigSchema;
        customOverrideCriteria: {
          bestPlant?: string;
          worstPlant?: string;
        };
        customOverrideMatchParams: {
          plantsInPreferenceOrder?: string[];
        };
      }

      const customPluginOptions: PluginOptions<CustomPluginType> = {
        config: customConfigSchema.parse({}), // Defaults
        overrides: [
          {
            extra: {
              bestPlant: "ficus",
            },
            config: {
              value: 10,
            },
          },
        ],
      };

      const first = <T>(arr: T[] | undefined): T | undefined => (arr ? arr[0] : undefined);
      const customOverrideCriteriaFunctions: CustomOverrideCriteriaFunctions<GuildPluginData<CustomPluginType>> = {
        bestPlant: async (pluginData, matchParams, value) => {
          await sleep(50);
          return first(matchParams.extra?.plantsInPreferenceOrder) === value;
        },
      };

      const matchedConfig1 = await getMatchingPluginConfig<CustomPluginType, GuildPluginData<CustomPluginType>>({
        configSchema: customConfigSchema,
        pluginData: null as any,
        pluginOptions: customPluginOptions,
        matchParams: {
          extra: {
            plantsInPreferenceOrder: ["ficus", "daisy", "rose", "pine"],
          },
        },
        customOverrideCriteriaFunctions,
      });
      const matchedConfig2 = await getMatchingPluginConfig<CustomPluginType, GuildPluginData<CustomPluginType>>({
        configSchema: customConfigSchema,
        pluginData: null as any,
        pluginOptions: customPluginOptions,
        matchParams: {
          extra: {
            plantsInPreferenceOrder: ["daisy", "ficus", "rose", "pine"],
          },
        },
        customOverrideCriteriaFunctions,
      });

      assert.strictEqual(matchedConfig1.value, 10); // Matched
      assert.strictEqual(matchedConfig2.value, 5); // No match
    });

    it("false when no conditions are present", async () => {
      const pluginOpts: PluginOptions<SharedPluginType> = {
        config: {
          value: 5,
        },
        overrides: [
          {
            config: {
              value: 20,
            },
          },
        ],
      };

      const matchedConfig = await getMatchingPluginConfig({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts,
        matchParams: {},
      });
      assert.strictEqual(matchedConfig.value, 5);
    });

    it("false when an empty 'all' condition is present", async () => {
      const pluginOpts: PluginOptions<SharedPluginType> = {
        config: {
          value: 5,
        },
        overrides: [
          {
            user: "500",
            all: [],
            config: {
              value: 20,
            },
          },
        ],
      };

      const matchedConfig = await getMatchingPluginConfig({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts,
        matchParams: {
          userId: "500",
        },
      });
      assert.strictEqual(matchedConfig.value, 5);
    });

    it("false when an empty 'any' condition is present", async () => {
      const pluginOpts: PluginOptions<SharedPluginType> = {
        config: {
          value: 5,
        },
        overrides: [
          {
            user: "500",
            any: [],
            config: {
              value: 20,
            },
          },
        ],
      };

      const matchedConfig = await getMatchingPluginConfig({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts,
        matchParams: {
          userId: "500",
        },
      });
      assert.strictEqual(matchedConfig.value, 5);
    });

    it("errors when an unknown condition is present", async () => {
      const pluginOpts: PluginOptions<SharedPluginType> = {
        config: {
          value: 5,
        },
        overrides: [
          {
            user: "500",
            unknown: "foo",
            config: {
              value: 20,
            },
          } as any,
        ],
      };

      try {
        await getMatchingPluginConfig({
          configSchema: sharedConfigSchema,
          pluginData: null as any,
          pluginOptions: pluginOpts,
          matchParams: {
            userId: "500",
          },
        });
        assert.fail("No error was thrown");
      } catch {}
    });

    it("'all' special criterion", async () => {
      const pluginOpts: PluginOptions<SharedPluginType> = {
        config: {},
        overrides: [
          {
            user: "1000",
            all: [
              {
                level: ">=50",
              },
              {
                level: "<100",
              },
            ],
            config: {
              value: 10,
            },
          },
        ],
      };

      const matchedConfig1 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts,
        matchParams: {
          userId: "1000",
          level: 75,
        },
      });
      const matchedConfig2 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts,
        matchParams: {
          userId: "1000",
          level: 120,
        },
      });
      const matchedConfig3 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts,
        matchParams: {
          userId: "1000",
          level: 25,
        },
      });

      assert.strictEqual(matchedConfig1.value, 10);
      assert.strictEqual(matchedConfig2.value, 5);
      assert.strictEqual(matchedConfig3.value, 5);
    });

    it("'any' special criterion", async () => {
      const pluginOpts: PluginOptions<SharedPluginType> = {
        config: {},
        overrides: [
          {
            any: [
              {
                level: "<25",
              },
              {
                level: ">75",
              },
            ],
            config: {
              value: 10,
            },
          },
        ],
      };

      const matchedConfig1 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts,
        matchParams: {
          level: 15,
        },
      });
      const matchedConfig2 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts,
        matchParams: {
          level: 95,
        },
      });
      const matchedConfig3 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts,
        matchParams: {
          level: 50,
        },
      });

      assert.strictEqual(matchedConfig1.value, 10);
      assert.strictEqual(matchedConfig2.value, 10);
      assert.strictEqual(matchedConfig3.value, 5);
    });

    it("'not' special criterion", async () => {
      const pluginOpts1: PluginOptions<SharedPluginType> = {
        config: {},
        overrides: [
          // Matches as long as the user isn't 1234
          {
            not: {
              user: "1234",
            },
            config: {
              value: 10,
            },
          },
        ],
      };

      const pluginOpts2: PluginOptions<SharedPluginType> = {
        config: {},
        overrides: [
          // Matches if your level is greater than or equal to 50, as long as the user isn't 1234
          {
            all: [
              {
                level: ">=50",
              },
              {
                not: {
                  user: "1234",
                },
              },
            ],
            config: {
              value: 20,
            },
          },
        ],
      };

      const pluginOpts3: PluginOptions<SharedPluginType> = {
        config: {
          value: 5,
        },
        overrides: [
          // Matches if your level is greater than or equal to 50 (via negation)
          {
            not: {
              level: "<50",
            },
            config: {
              value: 30,
            },
          },
        ],
      };

      const matchedConfig1 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts1,
        matchParams: {
          userId: "1234",
        },
      });
      const matchedConfig2 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts1,
        matchParams: {
          userId: "5678",
        },
      });

      assert.strictEqual(matchedConfig1.value, 5);
      assert.strictEqual(matchedConfig2.value, 10);

      const matchedConfig3 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts2,
        matchParams: {
          level: 95,
          userId: "1234",
        },
      });
      const matchedConfig4 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts2,
        matchParams: {
          level: 95,
          userId: "5678",
        },
      });

      assert.strictEqual(matchedConfig3.value, 5);
      assert.strictEqual(matchedConfig4.value, 20);

      const matchedConfig5 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts3,
        matchParams: {
          level: 49,
        },
      });
      const matchedConfig6 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts3,
        matchParams: {
          level: 50,
        },
      });
      const matchedConfig7 = await getMatchingPluginConfig<SharedPluginType, GuildPluginData<SharedPluginType>>({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts3,
        matchParams: {
          level: 51,
        },
      });

      assert.strictEqual(matchedConfig5.value, 5);
      assert.strictEqual(matchedConfig6.value, 30);
      assert.strictEqual(matchedConfig7.value, 30);
    });

    it("level matching against 0 works", async () => {
      const pluginOpts: PluginOptions<BasePluginType> = {
        config: {
          value: 5,
        },
        overrides: [
          {
            level: "<=30",
            config: {
              value: 20,
            },
          },
        ],
      };

      const matchedConfig = await getMatchingPluginConfig({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts,
        matchParams: { level: 0 },
      });
      assert.strictEqual(matchedConfig.value, 20);
    });

    it("complex nested overrides work", async () => {
      // EITHER:
      // - Channel is 123, roles include 456, roles do NOT include 789
      // OR:
      // - Channel is 111, role is 222
      const pluginOpts: PluginOptions<BasePluginType> = {
        config: {
          value: 5,
        },
        overrides: [
          {
            any: [
              {
                all: [
                  {
                    channel: "123",
                    role: "456",
                  },
                  {
                    not: {
                      role: "789",
                    },
                  },
                ],
              },
              {
                channel: "111",
                role: "222",
              },
            ],
            config: {
              value: 20,
            },
          },
        ],
      };

      const matchedConfig1 = await getMatchingPluginConfig({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts,
        matchParams: {},
      });
      assert.strictEqual(matchedConfig1.value, 5);

      // Excluded role "789" included, fail
      const matchedConfig2 = await getMatchingPluginConfig({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts,
        matchParams: {
          channelId: "123",
          memberRoles: ["456", "789"],
        },
      });
      assert.strictEqual(matchedConfig2.value, 5);

      // Excluded role "789" not included, pass
      const matchedConfig3 = await getMatchingPluginConfig({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts,
        matchParams: {
          channelId: "123",
          memberRoles: ["456"],
        },
      });
      assert.strictEqual(matchedConfig3.value, 20);

      // Required role "456" not included, fail
      const matchedConfig4 = await getMatchingPluginConfig({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts,
        matchParams: {
          channelId: "123",
          memberRoles: [],
        },
      });
      assert.strictEqual(matchedConfig4.value, 5);

      // Alternative condition, pass
      const matchedConfig5 = await getMatchingPluginConfig({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts,
        matchParams: {
          channelId: "111",
          memberRoles: ["222"],
        },
      });
      assert.strictEqual(matchedConfig5.value, 20);

      // Alternative condition with excluded role of first condition, pass
      const matchedConfig6 = await getMatchingPluginConfig({
        configSchema: sharedConfigSchema,
        pluginData: null as any,
        pluginOptions: pluginOpts,
        matchParams: {
          channelId: "111",
          memberRoles: ["222", "789"],
        },
      });
      assert.strictEqual(matchedConfig6.value, 20);
    });
  });
});
