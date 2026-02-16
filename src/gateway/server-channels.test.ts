import { describe, expect, it, vi } from "vitest";
import type { ChannelPlugin } from "../channels/plugins/types.js";
import { createChannelManager } from "./server-channels.js";

const mocks = vi.hoisted(() => ({
  getChannelPlugin: vi.fn(),
  listChannelPlugins: vi.fn(),
}));

vi.mock("../channels/plugins/index.js", () => ({
  getChannelPlugin: (...args: unknown[]) => mocks.getChannelPlugin(...args),
  listChannelPlugins: (...args: unknown[]) => mocks.listChannelPlugins(...args),
}));

function createStubPlugin(params: {
  id: ChannelPlugin["id"];
  listAccountIds: () => string[];
  startAccount?: ReturnType<typeof vi.fn>;
}): ChannelPlugin {
  const startAccount = params.startAccount ?? vi.fn().mockResolvedValue(undefined);
  return {
    id: params.id,
    meta: {
      id: params.id,
      label: String(params.id),
      selectionLabel: String(params.id),
      docsPath: `/channels/${params.id}`,
      blurb: "test stub",
    },
    capabilities: { chatTypes: ["direct"] },
    config: {
      listAccountIds: params.listAccountIds,
      resolveAccount: (_cfg, accountId) => ({ accountId: accountId ?? "default", enabled: true }),
      isConfigured: async () => true,
    },
    gateway: {
      startAccount,
    },
  };
}

function createStubLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("createChannelManager", () => {
  it("starts configured telegram accounts when plugin account list collapses to default", async () => {
    const startAccount = vi.fn().mockResolvedValue(undefined);
    const plugin = createStubPlugin({
      id: "telegram",
      listAccountIds: () => ["default"],
      startAccount,
    });
    mocks.getChannelPlugin.mockReturnValue(plugin);
    mocks.listChannelPlugins.mockReturnValue([plugin]);

    const logger = createStubLogger();
    const manager = createChannelManager({
      loadConfig: () =>
        ({
          channels: {
            telegram: {
              accounts: {
                leonard: { botToken: "tok-leonard" },
                maple: { botToken: "tok-maple" },
              },
            },
          },
        }) as never,
      channelLogs: { telegram: logger } as never,
      channelRuntimeEnvs: { telegram: {} } as never,
    });

    await manager.startChannel("telegram");

    expect(startAccount).toHaveBeenCalledTimes(2);
    expect(startAccount.mock.calls.map((call) => call[0].accountId)).toEqual(["leonard", "maple"]);
  });
});
