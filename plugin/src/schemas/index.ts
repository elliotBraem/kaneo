import {
  createConfigSchema,
  createInputSchema,
  createOutputSchema,
  z,
} from "@usersdotfun/core-sdk";

// Config schema with variables and secrets
export const KaneoConfigSchema = createConfigSchema(
  // Variables (non-sensitive config)
  z.object({
    baseUrl: z.url().optional(),
    timeout: z.number().optional(),
  }),
  // Secrets (sensitive config, hydrated at runtime)
  z.object({
    apiKey: z.string().min(1, "API key is required"),
  }),
);

// Input schema
export const KaneoInputSchema = createInputSchema(
  z.object({
    query: z.string(),
    options: z
      .object({
        limit: z.number().optional(),
      })
      .optional(),
  }),
);

// Output schema
export const KaneoOutputSchema = createOutputSchema(
  z.object({
    results: z.array(
      z.object({
        id: z.string(),
        content: z.string(),
      }),
    ),
    count: z.number(),
  }),
);

// Derived types
export type KaneoConfig = z.infer<typeof KaneoConfigSchema>;
export type KaneoInput = z.infer<typeof KaneoInputSchema>;
export type KaneoOutput = z.infer<typeof KaneoOutputSchema>;
