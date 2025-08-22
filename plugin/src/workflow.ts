import type { KaneoInput } from "./schemas";

/**
 * Example workflow demonstrating how the Kaneo plugin processes social media feedback
 *
 * Scenario: A Twitter user reports a bug on a project's social media account
 * Tweet: "@usersdotfun @projectAccount your website is broken #bug assign to @developer1"
 */

// Example input that would be generated from AI processing of the tweet
export const exampleSocialFeedbackInput: KaneoInput = {
  // Task details extracted by AI from the tweet
  task: {
    title: "Website broken - reported via Twitter",
    description:
      "User reported that the website is broken. Original tweet: '@usersdotfun @projectAccount your website is broken #bug assign to @developer1'",
    status: "todo",
    priority: "high", // AI determined this is high priority based on "broken"
    labels: ["bug", "website"], // Extracted from hashtags and content
  },

  // Project context from @projectAccount mention
  project: {
    name: "ProjectAccount Website",
    slug: "projectaccount-website",
    icon: "🌐",
    description: "Main website for ProjectAccount",
    ownerSocial: {
      platform: "twitter",
      username: "projectAccount",
      displayName: "Project Account",
    },
  },

  // Workspace context (derived from usersdotfun mention)
  workspace: {
    name: "usersdotfun",
    description: "Main workspace for usersdotfun projects",
  },

  // Task creator (the person who posted the tweet)
  creator: {
    platform: "twitter",
    username: "user123",
    displayName: "John Doe",
  },

  // Task assignee (extracted from "assign to @developer1")
  assignee: {
    platform: "twitter",
    username: "developer1",
    displayName: "Developer One",
  },
};

/**
 * Expected workflow execution:
 *
 * 1. Plugin receives the input above
 * 2. Creates/finds workspace "usersdotfun"
 * 3. Creates/finds user for @projectAccount as workspace owner
 * 4. Creates/finds project "ProjectAccount Website" in the workspace
 * 5. Creates/finds user for @user123 as contributor (task creator)
 * 6. Creates/finds user for @developer1 as contributor (task assignee)
 * 7. Creates task with:
 *    - Title: "Website broken - reported via Twitter"
 *    - Assigned to: @developer1
 *    - Created by: @user123 (in metadata)
 *    - Labels: ["bug", "website"]
 *    - Source: "social_feedback" (in metadata)
 *
 * Result: A complete task management setup from a single social media mention!
 */

// Example of how the plugin would be used in a larger system
export async function processSocialFeedback(
  tweetText: string,
  mentions: string[],
  hashtags: string[],
  author: { username: string; displayName: string },
): Promise<KaneoInput> {
  // This would typically involve AI processing to extract structured data
  // from the unstructured social media post

  // Extract project and workspace from mentions
  const projectMention = mentions.find((m) => m !== "usersdotfun");
  const workspaceMention = mentions.find((m) => m === "usersdotfun");

  // Extract assignment from text
  const assignmentMatch = tweetText.match(/assign to @(\w+)/i);
  const assignee = assignmentMatch ? assignmentMatch[1] : undefined;

  // Determine priority from keywords
  const priority =
    tweetText.toLowerCase().includes("broken") ||
    tweetText.toLowerCase().includes("urgent")
      ? "high"
      : "medium";

  // Extract labels from hashtags and keywords
  const labels = [
    ...hashtags,
    ...(tweetText.toLowerCase().includes("website") ? ["website"] : []),
  ];

  return {
    task: {
      title: `${hashtags[0] || "Issue"} reported via Twitter`,
      description: `User reported: "${tweetText}"`,
      status: "todo",
      priority,
      labels,
    },
    project: {
      name: `${projectMention} Project`,
      slug: `${projectMention}-project`,
      icon: "📋",
      ownerSocial: {
        platform: "twitter",
        username: projectMention || "unknown",
        displayName: projectMention || "Unknown Project",
      },
    },
    workspace: {
      name: workspaceMention || "default",
      description: `Workspace for ${workspaceMention || "default"} projects`,
    },
    creator: {
      platform: "twitter",
      username: author.username,
      displayName: author.displayName,
    },
    assignee: assignee
      ? {
          platform: "twitter",
          username: assignee,
          displayName: assignee,
        }
      : undefined,
  };
}
