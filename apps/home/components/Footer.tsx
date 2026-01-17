"use client";

import Link from "next/link";
import { cn } from "@workspace/ui/lib/utils";
import { BsGithub, BsDiscord, BsTwitterX } from "react-icons/bs";

interface FooterProps {}

const footerLinks = {
  product: [
    { name: "Features", href: "/" },
    { name: "Changelog", href: "/" },
    { name: "Roadmap", href: "/" },
  ],
  resources: [
    { name: "Documentation", href: "https://docs.stellarstack.app" },
    { name: "API Reference", href: "https://docs.stellarstack.app/api" },
    { name: "Guides", href: "https://docs.stellarstack.app/guides" },
    { name: "Community", href: "https://discord.gg/stellarstack" },
  ],
  company: [
    { name: "About", href: "/" },
    { name: "Careers", href: "/" },
    { name: "Contact", href: "mailto:hello@stellarstack.app" },
  ],
};

export const Footer = ({}: FooterProps) => {
  return (
    <footer
      className={cn(
        "relative overflow-hidden border-t",
        "border-zinc-800 bg-zinc-900/50"
      )}
    >
      {/* Main Footer Content */}
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link
              href="/"
              className={cn(
                "mb-4 block text-lg font-light tracking-[0.2em]",
                "text-zinc-100"
              )}
            >
              STELLARSTACK
            </Link>
            <p className={cn("mb-6 text-sm", "text-zinc-500")}>
              Open-source game server management for the modern era.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/MarquesCoding/StellarStack"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "transition-colors",
                  "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <BsGithub className="h-5 w-5" />
              </a>
              <a
                href="https://discord.gg/stellarstack"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "transition-colors",
                  "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <BsDiscord className="h-5 w-5" />
              </a>
              <a
                href="https://twitter.com/stellarstack"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "transition-colors",
                  "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <BsTwitterX className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4
              className={cn(
                "mb-4 text-xs font-medium tracking-wider uppercase",
                "text-zinc-400"
              )}
            >
              Product
            </h4>
            <ul className="space-y-3">
              {footerLinks.product.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={cn(
                      "text-sm transition-colors",
                      "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4
              className={cn(
                "mb-4 text-xs font-medium tracking-wider uppercase",
                "text-zinc-400"
              )}
            >
              Resources
            </h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((item) => (
                <li key={item.name}>
                  <a
                    href={item.href}
                    className={cn(
                      "text-sm transition-colors",
                      "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    {item.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4
              className={cn(
                "mb-4 text-xs font-medium tracking-wider uppercase",
                "text-zinc-400"
              )}
            >
              Company
            </h4>
            <ul className="space-y-3">
              {footerLinks.company.map((item) => (
                <li key={item.name}>
                  <a
                    href={item.href}
                    className={cn(
                      "text-sm transition-colors",
                      "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    {item.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div
          className={cn(
            "mt-16 flex flex-col items-center justify-between gap-4 border-t pt-8 md:flex-row",
            "border-zinc-800"
          )}
        >
          <p className={cn("text-xs", "text-zinc-600")}>
            &copy; {new Date().getFullYear()} StellarStack. Open source under MIT License.
          </p>
          <div className="flex items-center gap-6">
            {["Privacy", "Terms", "License"].map((item) => (
              <a
                key={item}
                href="#"
                className={cn(
                  "text-xs transition-colors",
                  "text-zinc-600 hover:text-zinc-400"
                )}
              >
                {item}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Large Cut-off Text */}
      <div className="relative overflow-hidden" style={{ height: "clamp(40px, 8vw, 120px)" }}>
        <div className="relative mx-auto h-full max-w-7xl px-6">
          <div
            className={cn(
              "pointer-events-none absolute right-6 bottom-10 left-6 translate-y-[50%] text-center text-7xl font-bold whitespace-nowrap select-none lg:text-[7.25rem]",
              "text-zinc-800/50"
            )}
            style={{
              letterSpacing: "0.2em",
              lineHeight: "0.8",
              WebkitMaskImage: "linear-gradient(to bottom, black 0%, transparent 75%)",
              maskImage: "linear-gradient(to bottom, black 0%, transparent 75%)",
            }}
          >
            STELLARSTACK
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
