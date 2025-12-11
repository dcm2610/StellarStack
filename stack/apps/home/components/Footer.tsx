"use client";

import Link from "next/link";
import { cn } from "@workspace/ui/lib/utils";
import { BsGithub, BsDiscord, BsTwitterX } from "react-icons/bs";

interface FooterProps {
  isDark: boolean;
}

const footerLinks = {
  product: [
    { name: "Features", href: "/features" },
    { name: "Changelog", href: "/changelog" },
    { name: "Roadmap", href: "/roadmap" },
  ],
  resources: [
    { name: "Documentation", href: "https://docs.stellarstack.app" },
    { name: "API Reference", href: "https://docs.stellarstack.app/api" },
    { name: "Guides", href: "https://docs.stellarstack.app/guides" },
    { name: "Community", href: "https://discord.gg/stellarstack" },
  ],
  company: [
    { name: "About", href: "/about" },
    { name: "Careers", href: "/careers" },
    { name: "Contact", href: "mailto:hello@stellarstack.app" },
  ],
};

export const Footer = ({ isDark }: FooterProps) => {
  return (
    <footer className={cn(
      "relative border-t overflow-hidden",
      isDark ? "border-zinc-800 bg-zinc-900/50" : "border-zinc-200 bg-white"
    )}>
      {/* Main Footer Content */}
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className={cn(
              "text-lg font-light tracking-[0.2em] block mb-4",
              isDark ? "text-zinc-100" : "text-zinc-800"
            )}>
              STELLARSTACK
            </Link>
            <p className={cn(
              "text-sm mb-6",
              isDark ? "text-zinc-500" : "text-zinc-500"
            )}>
              Open-source game server management for the modern era.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/MarquesCoding/StellarStack"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "transition-colors",
                  isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"
                )}
              >
                <BsGithub className="w-5 h-5" />
              </a>
              <a
                href="https://discord.gg/stellarstack"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "transition-colors",
                  isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"
                )}
              >
                <BsDiscord className="w-5 h-5" />
              </a>
              <a
                href="https://twitter.com/stellarstack"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "transition-colors",
                  isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"
                )}
              >
                <BsTwitterX className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className={cn(
              "text-xs font-medium uppercase tracking-wider mb-4",
              isDark ? "text-zinc-400" : "text-zinc-600"
            )}>
              Product
            </h4>
            <ul className="space-y-3">
              {footerLinks.product.map((item) => (
                <li key={item.name}>
                  <Link href={item.href} className={cn(
                    "text-sm transition-colors",
                    isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-500 hover:text-zinc-700"
                  )}>
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className={cn(
              "text-xs font-medium uppercase tracking-wider mb-4",
              isDark ? "text-zinc-400" : "text-zinc-600"
            )}>
              Resources
            </h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((item) => (
                <li key={item.name}>
                  <a href={item.href} className={cn(
                    "text-sm transition-colors",
                    isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-500 hover:text-zinc-700"
                  )}>
                    {item.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className={cn(
              "text-xs font-medium uppercase tracking-wider mb-4",
              isDark ? "text-zinc-400" : "text-zinc-600"
            )}>
              Company
            </h4>
            <ul className="space-y-3">
              {footerLinks.company.map((item) => (
                <li key={item.name}>
                  <a href={item.href} className={cn(
                    "text-sm transition-colors",
                    isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-500 hover:text-zinc-700"
                  )}>
                    {item.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className={cn(
          "mt-16 pt-8 border-t flex flex-col md:flex-row items-center justify-between gap-4",
          isDark ? "border-zinc-800" : "border-zinc-200"
        )}>
          <p className={cn(
            "text-xs",
            isDark ? "text-zinc-600" : "text-zinc-400"
          )}>
            &copy; {new Date().getFullYear()} StellarStack. Open source under MIT License.
          </p>
          <div className="flex items-center gap-6">
            {["Privacy", "Terms", "License"].map((item) => (
              <a key={item} href="#" className={cn(
                "text-xs transition-colors",
                isDark ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-600"
              )}>
                {item}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Large Cut-off Text */}
      <div className="relative overflow-hidden" style={{ height: "clamp(40px, 8vw, 120px)" }}>
        <div className="max-w-7xl mx-auto px-6 h-full relative">
          <div
            className={cn(
              "absolute text-7xl lg:text-[7.25rem] bottom-10 left-6 right-6 translate-y-[50%] font-bold select-none pointer-events-none text-center whitespace-nowrap",
              isDark ? "text-zinc-800/50" : "text-zinc-200"
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
