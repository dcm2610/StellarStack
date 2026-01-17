"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { BsGithub, BsList, BsX } from "react-icons/bs";

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
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

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
      <nav className="fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-md bg-[#0b0b0a]/80 border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-lg font-light tracking-[0.2em] text-zinc-100">
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
                    className="text-xs uppercase tracking-wider transition-colors text-zinc-400 hover:text-zinc-100"
                  >
                    {link.label}
                  </a>
                ) : link.isAnchor ? (
                  <a
                    key={link.href}
                    href={link.href}
                    className="text-xs uppercase tracking-wider transition-colors text-zinc-400 hover:text-zinc-100"
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
                        ? "text-zinc-100"
                        : "text-zinc-400 hover:text-zinc-100"
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
                  className="text-xs uppercase tracking-wider transition-colors flex items-center gap-2 text-zinc-400 hover:text-zinc-100"
                >
                  <BsGithub className="w-4 h-4" />
                  GitHub
                </a>
              )}
            </div>

            {/* Mobile Menu Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(true)}
              className="md:hidden transition-all p-2 border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
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
              className="fixed top-0 right-0 bottom-0 z-[70] w-72 border-l md:hidden bg-[#0b0b0a] border-zinc-800"
            >
              {/* Sidebar Header */}
              <div className="flex items-center justify-between h-16 px-6 border-b border-zinc-800">
                <span className="text-sm font-light tracking-[0.15em] text-zinc-400">
                  MENU
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
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
                        className="block py-3 text-sm uppercase tracking-wider transition-colors text-zinc-400 hover:text-zinc-100"
                      >
                        {link.label}
                      </a>
                    ) : link.isAnchor ? (
                      <a
                        href={link.href}
                        onClick={() => handleLinkClick(link.href, true)}
                        className="block py-3 text-sm uppercase tracking-wider transition-colors text-zinc-400 hover:text-zinc-100"
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
                            ? "text-zinc-100"
                            : "text-zinc-400 hover:text-zinc-100"
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
                      className="flex items-center gap-3 py-3 text-sm uppercase tracking-wider transition-colors text-zinc-400 hover:text-zinc-100"
                    >
                      <BsGithub className="w-4 h-4" />
                      GitHub
                    </a>
                  </motion.div>
                )}
              </div>

              {/* Sidebar Footer */}
              <div className="absolute bottom-0 left-0 right-0 px-6 py-6 border-t border-zinc-800">
                <p className="text-xs text-zinc-600">
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
