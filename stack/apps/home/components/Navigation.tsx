"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme as useNextTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { BsSun, BsMoon, BsGithub, BsList, BsX } from "react-icons/bs";

interface NavLink {
  href: string;
  label: string;
  isExternal?: boolean;
  isAnchor?: boolean;
}

interface NavigationProps {
  links?: NavLink[];
  showGitHub?: boolean;
}

const defaultLinks: NavLink[] = [
  { href: "/features", label: "Features" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/changelog", label: "Changelog" },
];

export const Navigation = ({ links = defaultLinks, showGitHub = true }: NavigationProps) => {
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close sidebar on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  const isActive = (href: string) => {
    if (href.startsWith("#")) return false;
    return pathname === href;
  };

  const handleLinkClick = (href: string, isAnchor?: boolean) => {
    if (isAnchor) {
      setIsOpen(false);
    }
  };

  return (
    <>
      <nav className={cn(
        "fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-md",
        isDark
          ? "bg-[#0b0b0a]/80 border-zinc-800"
          : "bg-[#f5f5f4]/80 border-zinc-200"
      )}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className={cn(
            "text-lg font-light tracking-[0.2em]",
            isDark ? "text-zinc-100" : "text-zinc-800"
          )}>
            STELLARSTACK
          </Link>

          <div className="flex items-center gap-4">
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-6">
              {links.map((link) => (
                link.isExternal ? (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "text-xs uppercase tracking-wider transition-colors",
                      isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                    )}
                  >
                    {link.label}
                  </a>
                ) : link.isAnchor ? (
                  <a
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "text-xs uppercase tracking-wider transition-colors",
                      isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                    )}
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "text-xs uppercase tracking-wider transition-colors",
                      isActive(link.href)
                        ? isDark ? "text-zinc-100" : "text-zinc-900"
                        : isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                    )}
                  >
                    {link.label}
                  </Link>
                )
              ))}
              {showGitHub && (
                <a
                  href="https://github.com/stellarstack/stellarstack"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "text-xs uppercase tracking-wider transition-colors flex items-center gap-2",
                    isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                  )}
                >
                  <BsGithub className="w-4 h-4" />
                  GitHub
                </a>
              )}
            </div>

            {/* Theme Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={cn(
                "transition-all hover:scale-110 active:scale-95 p-2",
                isDark
                  ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                  : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
              )}
            >
              {isDark ? <BsSun className="w-4 h-4" /> : <BsMoon className="w-4 h-4" />}
            </Button>

            {/* Mobile Menu Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(true)}
              className={cn(
                "md:hidden transition-all p-2",
                isDark
                  ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                  : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
              )}
            >
              <BsList className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm md:hidden"
            />

            {/* Sidebar */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className={cn(
                "fixed top-0 right-0 bottom-0 z-[70] w-72 border-l md:hidden",
                isDark
                  ? "bg-[#0b0b0a] border-zinc-800"
                  : "bg-[#f5f5f4] border-zinc-200"
              )}
            >
              {/* Sidebar Header */}
              <div className={cn(
                "flex items-center justify-between h-16 px-6 border-b",
                isDark ? "border-zinc-800" : "border-zinc-200"
              )}>
                <span className={cn(
                  "text-sm font-light tracking-[0.15em]",
                  isDark ? "text-zinc-400" : "text-zinc-600"
                )}>
                  MENU
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "p-2",
                    isDark
                      ? "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                      : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200"
                  )}
                >
                  <BsX className="w-5 h-5" />
                </Button>
              </div>

              {/* Sidebar Links */}
              <div className="px-6 py-6 space-y-2">
                {links.map((link, index) => (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    {link.isExternal ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setIsOpen(false)}
                        className={cn(
                          "block py-3 text-sm uppercase tracking-wider transition-colors",
                          isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                        )}
                      >
                        {link.label}
                      </a>
                    ) : link.isAnchor ? (
                      <a
                        href={link.href}
                        onClick={() => handleLinkClick(link.href, true)}
                        className={cn(
                          "block py-3 text-sm uppercase tracking-wider transition-colors",
                          isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                        )}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        onClick={() => setIsOpen(false)}
                        className={cn(
                          "block py-3 text-sm uppercase tracking-wider transition-colors",
                          isActive(link.href)
                            ? isDark ? "text-zinc-100" : "text-zinc-900"
                            : isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                        )}
                      >
                        {link.label}
                      </Link>
                    )}
                  </motion.div>
                ))}

                {showGitHub && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: links.length * 0.05 }}
                  >
                    <a
                      href="https://github.com/stellarstack/stellarstack"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        "flex items-center gap-3 py-3 text-sm uppercase tracking-wider transition-colors",
                        isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                      )}
                    >
                      <BsGithub className="w-4 h-4" />
                      GitHub
                    </a>
                  </motion.div>
                )}
              </div>

              {/* Sidebar Footer */}
              <div className={cn(
                "absolute bottom-0 left-0 right-0 px-6 py-6 border-t",
                isDark ? "border-zinc-800" : "border-zinc-200"
              )}>
                <p className={cn(
                  "text-xs",
                  isDark ? "text-zinc-600" : "text-zinc-400"
                )}>
                  Open Source Game Server Management
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
