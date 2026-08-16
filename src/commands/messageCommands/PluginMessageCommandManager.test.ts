import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { createMockClient } from "../../testUtils.ts";
import { type CommandRemovedEvent, PluginMessageCommandManager } from "./PluginMessageCommandManager.ts";

const noop = () => {};

describe("PluginMessageCommandManager", () => {
  it("emits lifecycle events when commands are added, replaced, and removed", () => {
    const client = createMockClient();
    const manager = new PluginMessageCommandManager(client, { prefix: "!" });

    const pluginData = {
      pluginName: "test",
      context: "guild",
      getVetyInstance: () => ({ profiler: { addDataPoint: noop } }),
    } as any;

    manager.setPluginData(pluginData);

    const addedTriggers: string[] = [];
    const removedEvents: CommandRemovedEvent<any>[] = [];

    manager.onCommandAdded(({ command }) => {
      const trigger =
        typeof command.originalTriggers[0] === "string"
          ? command.originalTriggers[0]
          : command.originalTriggers[0].source;
      addedTriggers.push(trigger);
    });

    manager.onCommandDeleted((event) => {
      removedEvents.push(event);
    });

    const blueprint = {
      type: "message" as const,
      trigger: "foo",
      permission: null,
      run: noop,
    };

    manager.add(blueprint as any);
    assert.deepStrictEqual(addedTriggers, ["foo"]);
    assert.strictEqual(removedEvents.length, 0);

    const command = manager.getAll()[0]!;
    manager.remove(command.id);
    assert.strictEqual(removedEvents.length, 1);
    assert.strictEqual(removedEvents[0]!.reason, "manual");

    manager.add(blueprint as any);
    assert.deepStrictEqual(addedTriggers, ["foo", "foo"]);

    manager.removeByTrigger("foo");
    assert.strictEqual(removedEvents.length, 2);
    assert.strictEqual(removedEvents[1]!.reason, "manual");
  });
});
