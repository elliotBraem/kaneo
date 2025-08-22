import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { Role } from "../../apps/api/src/permissions";
import type { AppRouter } from "../../apps/api/src/routers";
import type { WorkspaceUser } from "./../../apps/web/src/types/index";
import { type KaneoAuthClient, createKaneoAuthClient } from "./auth-client";
import type { SocialAccount } from "./schemas";
import type {
  CreateProjectInput,
  CreateTaskInput,
  TaskWithAttribution,
  UserData,
  WorkspaceData,
} from "./types";

export class KaneoClient {
  private trpcClient: ReturnType<typeof createTRPCClient<AppRouter>>;
  private authClient: KaneoAuthClient;

  constructor(baseUrl: string, apiKey: string) {
    this.trpcClient = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${baseUrl}/trpc`,
          headers: {
            "x-api-key": apiKey,
          },
        }),
      ],
    });

    this.authClient = createKaneoAuthClient(baseUrl);
  }

  async healthCheck(): Promise<string> {
    return this.trpcClient.healthCheck.query();
  }

  // Workspace operations using auth client
  async createWorkspace(input: {
    name: string;
    description?: string;
  }): Promise<WorkspaceData> {
    if (!this.authClient) {
      throw new Error("Auth client not initialized");
    }

    const slug = this.slugify(input.name);
    const metadata = input.description
      ? { description: input.description }
      : undefined;

    const { data, error } = await this.authClient.organization.create({
      name: input.name,
      slug,
      metadata,
    });

    if (error) {
      throw new Error(error.message || "Failed to create workspace");
    }

    // Set as active workspace
    await this.authClient.organization.setActive({
      organizationId: data.id,
    });

    return { ...data, created: true };
  }

  async findWorkspaceBySlug(slug: string): Promise<WorkspaceData | null> {
    if (!this.authClient) {
      throw new Error("Auth client not initialized");
    }

    // Use the checkSlug method to see if it exists
    const { data: slugExists } = await this.authClient.organization.checkSlug({
      slug,
    });

    if (!slugExists) {
      return null;
    }

    // If slug exists, get the organization list and find it
    const response = await this.authClient.organization.list();
    const workspaces = response.data || [];
    return workspaces.find((w) => w.slug === slug) || null;
  }

  async findWorkspaceOwner(workspaceId: string): Promise<UserData> {
    if (!this.authClient) {
      throw new Error("Auth client not initialized");
    }

    const response = await this.authClient.organization.listMembers({
      query: {
        organizationId: workspaceId,
      },
    });

    const membersData = response.data;
    if (!membersData || !membersData.members) {
      throw new Error("No members found for workspace");
    }

    const owner = membersData.members.find(
      (member: WorkspaceUser) => member.role === "owner",
    );
    if (!owner) {
      throw new Error("No owner found for workspace");
    }

    return {
      id: owner.userId,
      email: owner.user?.email,
      name: owner.user?.name,
      created: false,
    };
  }

  // Project operations using tRPC
  async createProject(
    input: CreateProjectInput,
  ): Promise<{ id: string; name: string; created: boolean }> {
    const project = await this.trpcClient.project.create.mutate(input);
    return { ...project, created: true };
  }

  async findProjectBySlug(
    workspaceId: string,
    slug: string,
  ): Promise<{ id: string; name: string; created: boolean } | null> {
    // TODO: Add findBySlug to project router
    // For now, we'll use the list endpoint and filter
    try {
      const projects = await this.trpcClient.project.list.query();
      const project = projects.find((p) => p.slug === slug);
      return project ? { ...project, created: false } : null;
    } catch {
      return null;
    }
  }

  // Task operations using tRPC
  async createTask(
    input: CreateTaskInput & {
      metadata?: {
        source: string;
        creatorId: string;
        labels?: string[];
      };
    },
  ): Promise<TaskWithAttribution> {
    const task = await this.trpcClient.task.create.mutate(input);
    const taskNumber = await this.trpcClient.task.getNextNumber.query({
      projectId: input.projectId,
    });

    return {
      ...task,
      number: taskNumber,
      metadata: input.metadata,
      assigneeId: task.userId,
    };
  }

  // User operations using invitations
  async createSocialUser(
    socialData: SocialAccount,
    role: Role,
  ): Promise<UserData> {
    // Create email in the format: platform:username@users.fun
    const email =
      socialData.email ||
      `${socialData.platform}:${socialData.username}@users.fun`;

    // Return a mock user for now - in practice this would create or find the user
    return {
      id: `social-${socialData.platform}-${socialData.username}`,
      email,
      name: socialData.displayName || socialData.username,
      created: true,
    };
  }

  async findSocialUser(socialData: SocialAccount): Promise<UserData | null> {
    // TODO: Implement social user lookup
    // This would require extending the user table with social platform data
    // For now, return null to indicate user doesn't exist
    return null;
  }

  async inviteUserToWorkspace(
    workspaceId: string,
    userEmail: string,
    role: Role,
  ): Promise<void> {
    if (!this.authClient) {
      throw new Error("Auth client not initialized");
    }

    const { error } = await this.authClient.organization.inviteMember({
      organizationId: workspaceId,
      email: userEmail,
      role,
    });

    if (error) {
      throw new Error(error.message || "Failed to invite user to workspace");
    }
  }

  // TODO: use common slug
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
