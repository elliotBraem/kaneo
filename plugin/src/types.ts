import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../apps/api/src/routers";

// Base tRPC types
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

// Task types
export type Task = RouterOutputs["task"]["get"];
export type CreateTaskInput = RouterInputs["task"]["create"];

// Project types
export type Project = RouterOutputs["project"]["get"];
export type CreateProjectInput = RouterInputs["project"]["create"];

// Workspace types - TODO: Add workspace router to API
export interface WorkspaceData {
  id: string;
  name: string;
  slug: string;
  description?: string;
  created?: boolean;
}

export interface CreateWorkspaceInput {
  name: string;
  description?: string;
  slug: string;
}

// User types - TODO: Add user router to API
export interface UserData {
  id: string;
  email?: string;
  name?: string;
  created?: boolean;
}

export interface CreateSocialUserInput {
  platform: string;
  username: string;
  displayName?: string;
  email?: string;
  role: string;
}

export interface FindSocialUserInput {
  platform: string;
  username: string;
}

// Extended task data with social attribution
export interface TaskWithAttribution extends Task {
  number: number;
  metadata?: {
    source: string;
    creatorId: string;
    labels?: string[];
  };
  assigneeId: string | null;
}
