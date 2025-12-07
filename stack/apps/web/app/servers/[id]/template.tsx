"use client";

import { PageTransition } from "@workspace/ui/components/shared/PageTransition";

export default function ServerTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageTransition>{children}</PageTransition>;
}
