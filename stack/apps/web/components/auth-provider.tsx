"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession, signOut as authSignOut } from "@/lib/auth-client";

interface User {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  image?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  isAdmin: false,
  signOut: async () => {},
});

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Routes that don't require authentication
const publicRoutes = ["/"];

// Routes that require admin role
const adminRoutes = ["/admin"];

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Cast session user to our User type (role comes from database via API)
  const user = session?.user ? (session.user as unknown as User) : null;
  const isAuthenticated = !!user;
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (isPending || isRedirecting) return;

    const isPublicRoute = publicRoutes.some((route) => pathname === route);
    const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route));

    // Redirect unauthenticated users to login
    if (!isAuthenticated && !isPublicRoute) {
      setIsRedirecting(true);
      router.push("/");
      return;
    }

    // Redirect authenticated users away from login page
    if (isAuthenticated && pathname === "/") {
      setIsRedirecting(true);
      router.push("/servers");
      return;
    }

    // Redirect non-admins away from admin routes
    if (isAuthenticated && isAdminRoute && !isAdmin) {
      setIsRedirecting(true);
      router.push("/servers");
      return;
    }

    setIsRedirecting(false);
  }, [isAuthenticated, isAdmin, pathname, isPending, router, isRedirecting]);

  const handleSignOut = async () => {
    await authSignOut();
    router.push("/");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: isPending,
        isAuthenticated,
        isAdmin,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
