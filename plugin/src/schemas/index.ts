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
    baseUrl: z.url().default("http://localhost:1337"),
    timeout: z.number().default(30000),
  }),
  // Secrets (sensitive config, hydrated at runtime)
  z.object({
    apiKey: z.string().min(1, "API key is required"),
    serviceAccountEmail: z.email().optional(),
  }),
);

// Social account schema
const SocialAccountSchema = z.object({
  platform: z.enum(["twitter", "github"]),
  username: z.string(),
  displayName: z.string().optional(),
  email: z.string().email().optional(),
});

// Input schema for social media feedback workflow
export const KaneoInputSchema = createInputSchema(
  z.object({
    // Task details (from AI analysis)
    task: z.object({
      title: z.string(),
      description: z.string().optional(),
      status: z.string().default("todo"),
      priority: z.string().optional(),
      dueDate: z.string().optional(), // ISO date string
      labels: z.array(z.string()).optional(), // extracted hashtags/categories
    }),

    // Project context (from @projectAccount)
    project: z.object({
      name: z.string(),
      slug: z.string(),
      icon: z.string().default("📋"),
      description: z.string().optional(),
      ownerSocial: SocialAccountSchema,
    }),

    // Workspace context (derived from usersdotfun or project)
    workspace: z.object({
      name: z.string(),
      description: z.string().optional(),
    }),

    // Task creator (from @user1 - the person who posted)
    creator: SocialAccountSchema,

    // Task assignee (from "assign to @user2")
    assignee: SocialAccountSchema.optional(),
  }),
);

// Output schema
export const KaneoOutputSchema = createOutputSchema(
  z.object({
    workspace: z.object({
      id: z.string(),
      name: z.string(),
      created: z.boolean(), // was it created in this execution
    }),
    project: z.object({
      id: z.string(),
      name: z.string(),
      created: z.boolean(),
    }),
    task: z.object({
      id: z.string(),
      title: z.string(),
      number: z.number(), // task number within project
    }),
    users: z.object({
      projectOwner: z.object({
        id: z.string(),
        email: z.string().optional(),
        created: z.boolean(),
      }),
      creator: z.object({
        id: z.string(),
        email: z.string().optional(),
        created: z.boolean(),
      }),
      assignee: z
        .object({
          id: z.string(),
          email: z.string().optional(),
          created: z.boolean(),
        })
        .optional(),
    }),
  }),
);

// Derived types
export type KaneoConfig = z.infer<typeof KaneoConfigSchema>;
export type KaneoInput = z.infer<typeof KaneoInputSchema>;
export type KaneoOutput = z.infer<typeof KaneoOutputSchema>;
export type SocialAccount = z.infer<typeof SocialAccountSchema>;
