import {
  ConfigurationError,
  Effect,
  type Plugin,
  PluginExecutionError,
  PluginLoggerTag,
} from "@usersdotfun/core-sdk";
import { KaneoClient } from "./client";
import {
  type KaneoConfig,
  KaneoConfigSchema,
  type KaneoInput,
  KaneoInputSchema,
  type KaneoOutput,
  KaneoOutputSchema,
  type SocialAccount,
} from "./schemas";
import type { TaskWithAttribution, UserData, WorkspaceData } from "./types";

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
  private client: KaneoClient | null = null;

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

      // Initialize Kaneo client with tRPC and auth client
      try {
        self.client = new KaneoClient(
          config.variables?.baseUrl || "http://localhost:1337",
          config.secrets.apiKey,
        );
      } catch (clientError) {
        const error = new ConfigurationError(
          `Failed to initialize Kaneo client: ${clientError instanceof Error ? clientError.message : "Unknown error"}`,
        );
        yield* logger.logError("Client initialization failed", error);
        yield* Effect.fail(error);
        return;
      }

      // Test connection
      yield* Effect.tryPromise({
        try: () => {
          if (!self.client) {
            throw new Error("Client not initialized");
          }
          return self.client.healthCheck();
        },
        catch: (healthCheckError) => {
          const error = new ConfigurationError(
            `Health check failed: ${healthCheckError instanceof Error ? healthCheckError.message : "Unknown error"}`,
          );
          return error;
        },
      });

      yield* logger.logInfo("Kaneo plugin initialized successfully", {
        pluginId: self.id,
        baseUrl: config.variables?.baseUrl,
      });
    });
  }

  execute(
    input: KaneoInput,
  ): Effect.Effect<KaneoOutput, PluginExecutionError, PluginLoggerTag> {
    const self = this;
    return Effect.gen(function* () {
      const logger = yield* PluginLoggerTag;

      if (!self.config || !self.client) {
        yield* Effect.fail(
          new PluginExecutionError("Plugin not initialized", false),
        );
      }

      yield* logger.logDebug("Executing Kaneo social feedback workflow", {
        pluginId: self.id,
        taskTitle: input.task.title,
        projectName: input.project.name,
        workspaceName: input.workspace.name,
      });

      // Execute the complete workflow atomically
      return yield* Effect.tryPromise({
        try: async () => {
          // 1. Create/get workspace with project owner
          const { workspace, projectOwner } =
            await self.ensureWorkspaceWithOwner(
              input.workspace,
              input.project.ownerSocial,
            );

          // 2. Create/get project within workspace
          const project = await self.ensureProject(input.project, workspace.id);

          // 3. Create/invite task creator as contributor
          const creator = await self.ensureContributor(
            input.creator,
            workspace.id,
          );

          // 4. Create/invite assignee if specified
          const assignee = input.assignee
            ? await self.ensureContributor(input.assignee, workspace.id)
            : null;

          // 5. Create task with proper attribution
          const task = await self.createTask({
            ...input.task,
            projectId: project.id,
            creatorId: creator.id,
            assigneeId: assignee?.id,
          });

          return {
            success: true,
            data: {
              workspace: {
                id: workspace.id,
                name: workspace.name,
                created: workspace.created || false,
              },
              project: {
                id: project.id,
                name: project.name,
                created: project.created || false,
              },
              task: {
                id: task.id,
                title: task.title,
                number: task.number,
              },
              users: {
                projectOwner: {
                  id: projectOwner.id,
                  email: projectOwner.email,
                  created: projectOwner.created || false,
                },
                creator: {
                  id: creator.id,
                  email: creator.email,
                  created: creator.created || false,
                },
                assignee: assignee
                  ? {
                      id: assignee.id,
                      email: assignee.email,
                      created: assignee.created || false,
                    }
                  : undefined,
              },
            },
          } as KaneoOutput;
        },
        catch: (error) => {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          return new PluginExecutionError(
            `Social feedback workflow failed: ${errorMessage}`,
            true,
          );
        },
      });
    });
  }

  // Implement workspace creation with owner
  private async ensureWorkspaceWithOwner(
    workspaceData: { name: string; description?: string },
    ownerSocial: SocialAccount,
  ): Promise<{ workspace: WorkspaceData; projectOwner: UserData }> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    // Check if workspace exists by slug
    const slug = this.slugify(workspaceData.name);
    let workspace = await this.client.findWorkspaceBySlug(slug);

    let projectOwner: UserData;

    if (!workspace) {
      // Create/get project owner user
      projectOwner = await this.ensureSocialUser(ownerSocial, "owner");

      // Create workspace with owner
      workspace = await this.client.createWorkspace({
        name: workspaceData.name,
        description: workspaceData.description,
      });

      workspace.created = true;
    } else {
      workspace.created = false;
      // Get existing project owner
      projectOwner = await this.client.findWorkspaceOwner(workspace.id);
    }

    return { workspace, projectOwner };
  }

  // Implement project creation within workspace
  private async ensureProject(
    projectData: {
      name: string;
      slug: string;
      icon: string;
      description?: string;
    },
    workspaceId: string,
  ): Promise<{ id: string; name: string; created: boolean }> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    // Check if project exists
    let project = await this.client.findProjectBySlug(
      workspaceId,
      projectData.slug,
    );

    if (!project) {
      // Create new project
      project = await this.client.createProject({
        name: projectData.name,
        slug: projectData.slug,
        icon: projectData.icon,
        description: projectData.description,
      });

      project.created = true;
    } else {
      project.created = false;
    }

    return project;
  }

  // Implement social user creation/lookup
  private async ensureSocialUser(
    socialData: SocialAccount,
    role: "owner" | "admin" | "member" = "member",
  ): Promise<UserData> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    // Check if user exists by social account
    let user = await this.client.findSocialUser(socialData);

    if (!user) {
      // Create user account linked to social
      user = await this.client.createSocialUser(socialData, role);
      user.created = true;
    } else {
      user.created = false;
    }

    return user;
  }

  // Implement contributor creation (external users)
  private async ensureContributor(
    socialData: SocialAccount,
    workspaceId: string,
  ): Promise<UserData> {
    const user = await this.ensureSocialUser(socialData, "member");

    if (!this.client) {
      throw new Error("Client not initialized");
    }

    // Add user to workspace as member if not already member
    await this.client.inviteUserToWorkspace(
      workspaceId,
      user.email || `${socialData.platform}:${socialData.username}@users.fun`,
      "member",
    );

    return user;
  }

  // Implement task creation with attribution
  private async createTask(taskData: {
    title: string;
    description?: string;
    status: string;
    priority?: string;
    dueDate?: string;
    labels?: string[];
    projectId: string;
    creatorId: string;
    assigneeId?: string;
  }): Promise<TaskWithAttribution> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    // Create task with metadata for social attribution
    const task = await this.client.createTask({
      title: taskData.title,
      description: taskData.description,
      status: taskData.status,
      priority: taskData.priority,
      dueDate: taskData.dueDate ? new Date(taskData.dueDate) : undefined,
      projectId: taskData.projectId,
      userId: taskData.assigneeId, // Task assignee
      metadata: {
        source: "social_feedback",
        creatorId: taskData.creatorId,
        labels: taskData.labels,
      },
    });

    return task;
  }

  // Helper methods
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  shutdown(): Effect.Effect<void, never, PluginLoggerTag> {
    const self = this;
    return Effect.gen(function* () {
      const logger = yield* PluginLoggerTag;
      yield* logger.logInfo("Shutting down Kaneo plugin", {
        pluginId: self.id,
      });
      self.config = null;
      self.client = null;
    });
  }
}

export default KaneoPlugin;
