"use client";

import { useEffect, useState, memo } from "react";
import { useTheme } from "next-themes";
import { SidebarProvider, SidebarInset } from "@workspace/ui/components/sidebar";
import { AccountSidebar } from "@/components/account-sidebar";
import { AnimatedBackground } from "@workspace/ui/components/animated-background";
import { FloatingDots } from "@workspace/ui/components/floating-particles";

// Memoized background component to prevent re-renders
const PersistentBackground = memo(function PersistentBackground({ isDark }: { isDark: boolean }) {
  return (
    <>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={15} />
    </>
  );
});

export default function AccountLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  return (
    <>
      <PersistentBackground isDark={isDark} />
      <SidebarProvider>
        <AccountSidebar />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    </>
  );
}
