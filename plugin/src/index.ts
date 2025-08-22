import {
  ConfigurationError,
  Effect,
  type Plugin,
  PluginExecutionError,
  PluginLoggerTag,
} from "@usersdotfun/core-sdk";
import {
  type KaneoConfig,
  KaneoConfigSchema,
  type KaneoInput,
  KaneoInputSchema,
  type KaneoOutput,
  KaneoOutputSchema,
} from "./schemas";

export class KaneoPlugin
  implements
    Plugin<
      typeof KaneoInputSchema,
      typeof KaneoOutputSchema,
      typeof KaneoConfigSchema
    >
{
  readonly id = "@kaneo/plugin" as const;
  readonly type = "transformer" as const;
  readonly inputSchema = KaneoInputSchema;
  readonly outputSchema = KaneoOutputSchema;
  readonly configSchema = KaneoConfigSchema;

  private config: KaneoConfig | null = null;

  initialize(
    config?: KaneoConfig,
  ): Effect.Effect<void, ConfigurationError, PluginLoggerTag> {
    const self = this;
    return Effect.gen(function* () {
      const logger = yield* PluginLoggerTag;

      if (!config?.secrets?.apiKey) {
        const error = new ConfigurationError("API key is required.");
        yield* logger.logError(
          "Configuration error: API key is missing.",
          error,
        );
        yield* Effect.fail(error);
        return;
      }

      self.config = config;
      yield* logger.logInfo("Kaneo plugin initialized successfully", {
        pluginId: self.id,
      });
    });
  }

  execute(
    input: KaneoInput,
  ): Effect.Effect<KaneoOutput, PluginExecutionError, PluginLoggerTag> {
    const self = this;
    return Effect.gen(function* () {
      const logger = yield* PluginLoggerTag;

      if (!self.config) {
        yield* Effect.fail(
          new PluginExecutionError("Plugin not initialized", false),
        );
      }

      yield* logger.logDebug("Executing Kaneo plugin", {
        pluginId: self.id,
        query: input.query,
      });

      return yield* Effect.try({
        try: () => {
          // TODO: Implement your plugin logic here
          const results = [
            { id: "1", content: `Processed: ${input.query}` },
            { id: "2", content: "Example result" },
          ];

          return {
            success: true,
            data: {
              results,
              count: results.length,
            },
          } as KaneoOutput;
        },
        catch: (error) => {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          return new PluginExecutionError(errorMessage, true);
        },
      });
    });
  }

  shutdown(): Effect.Effect<void, never, PluginLoggerTag> {
    const self = this;
    return Effect.gen(function* () {
      const logger = yield* PluginLoggerTag;
      yield* logger.logInfo("Shutting down Kaneo plugin", {
        pluginId: self.id,
      });
      self.config = null;
    });
  }
}

export default KaneoPlugin;
