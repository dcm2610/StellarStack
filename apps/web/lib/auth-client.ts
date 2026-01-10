import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

// Create auth client with runtime URL - this is safe because Better Auth client
// only validates URL format, not connectivity, during initialization
const API_URL = typeof window !== "undefined" ? window.location.origin : "";

export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: "/api/auth",
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/auth/two-factor";
      },
    }),
    passkeyClient(),
  ],
});

export const { signIn, signOut, signUp, useSession, getSession } = authClient;
