import { createAuthClient } from "better-auth/client";
import {
  inferOrgAdditionalFields,
  organizationClient,
} from "better-auth/client/plugins";
import { apiKeyClient } from "better-auth/client/plugins";
import type { auth } from "../../apps/api/src/lib/auth";
import { ac, admin, member, owner } from "../../apps/api/src/permissions";

export const createKaneoAuthClient = (baseURL: string) => {
  return createAuthClient({
    baseURL,
    plugins: [
      apiKeyClient(),
      organizationClient({
        ac,
        roles: {
          member,
          admin,
          owner,
        },
        schema: inferOrgAdditionalFields<typeof auth>(),
      }),
    ],
  });
};

export type KaneoAuthClient = ReturnType<typeof createKaneoAuthClient>;
