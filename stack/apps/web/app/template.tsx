"use client";

import { PageTransition } from "@workspace/ui/components/shared/PageTransition";

export default function RootTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageTransition>{children}</PageTransition>;
}
