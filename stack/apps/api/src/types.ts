import type { User, Node, Server, Allocation, Blueprint } from "@prisma/client";

// Types for Hono context variables
export type Variables = {
  user: User;
  node: Node;
  server: Server & {
    allocations?: Allocation[];
    node?: Node;
    blueprint?: Blueprint;
  };
};

// User with role for auth checks
export type AuthUser = User & {
  role: "user" | "admin";
};
