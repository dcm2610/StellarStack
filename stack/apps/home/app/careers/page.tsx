"use client";

import { useState, useEffect, useRef, type JSX } from "react";
import Link from "next/link";
import { useTheme as useNextTheme } from "next-themes";
import { motion, useInView } from "framer-motion";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FloatingDots } from "@workspace/ui/components/shared/Animations";
import {
  BsSun,
  BsMoon,
  BsGithub,
  BsArrowRight,
  BsHeart,
  BsGlobe,
  BsLaptop,
} from "react-icons/bs";
import { Footer } from "@/components/Footer";

const perks = [
  {
    icon: BsGlobe,
    title: "Fully Remote",
    description: "Work from anywhere in the world. We're a distributed team spanning multiple timezones.",
  },
  {
    icon: BsLaptop,
    title: "Open Source Impact",
    description: "Your work will be used by thousands of server administrators and gaming communities worldwide.",
  },
  {
    icon: BsHeart,
    title: "Community First",
    description: "Join a passionate community of developers and gamers building something meaningful together.",
  },
];

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

// Animated section wrapper
const AnimatedSection = ({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={fadeInUp}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const CareersPage = (): JSX.Element | null => {
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  if (!mounted) return null;

  return (
    <div className={cn(
      "min-h-svh transition-colors relative",
      isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
    )}>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={20} />

      {/* Navigation */}
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

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-6">
              <Link href="/features" className={cn(
                "text-xs uppercase tracking-wider transition-colors",
                isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
              )}>
                Features
              </Link>
              <Link href="/roadmap" className={cn(
                "text-xs uppercase tracking-wider transition-colors",
                isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
              )}>
                Roadmap
              </Link>
              <Link href="/changelog" className={cn(
                "text-xs uppercase tracking-wider transition-colors",
                isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
              )}>
                Changelog
              </Link>
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
            </div>

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
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className={cn(
                "text-4xl md:text-6xl font-extralight tracking-tight mb-6",
                isDark ? "text-zinc-100" : "text-zinc-900"
              )}
            >
              Join Our Team
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className={cn(
                "text-lg md:text-xl max-w-2xl mx-auto leading-relaxed",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )}
            >
              Help us build the future of open-source game server management. We&apos;re always looking for passionate contributors.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Perks Section */}
      <section className="relative py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {perks.map((perk, i) => (
              <AnimatedSection key={i} delay={i * 0.1} className="h-full">
                <div className={cn(
                  "relative p-8 border transition-all h-full text-center",
                  isDark
                    ? "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700"
                    : "border-zinc-200 bg-white hover:border-zinc-300"
                )}>
                  <perk.icon className={cn(
                    "w-8 h-8 mx-auto mb-4",
                    isDark ? "text-zinc-400" : "text-zinc-600"
                  )} />
                  <h3 className={cn(
                    "text-lg font-medium mb-2",
                    isDark ? "text-zinc-100" : "text-zinc-900"
                  )}>
                    {perk.title}
                  </h3>
                  <p className={cn(
                    "text-sm leading-relaxed",
                    isDark ? "text-zinc-400" : "text-zinc-600"
                  )}>
                    {perk.description}
                  </p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Open Positions Section */}
      <section className={cn(
        "relative py-24 px-6 border-y",
        isDark ? "border-zinc-800 bg-zinc-900/30" : "border-zinc-200 bg-zinc-50"
      )}>
        <div className="max-w-4xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <h2 className={cn(
              "text-3xl md:text-4xl font-extralight tracking-tight mb-4",
              isDark ? "text-zinc-100" : "text-zinc-900"
            )}>
              Open Positions
            </h2>
            <p className={cn(
              "text-lg max-w-2xl mx-auto",
              isDark ? "text-zinc-400" : "text-zinc-600"
            )}>
              We&apos;re an open-source project and welcome contributors of all kinds.
            </p>
          </AnimatedSection>

          <AnimatedSection delay={0.1}>
            <div className={cn(
              "relative p-8 md:p-12 border text-center",
              isDark ? "border-zinc-800 bg-zinc-900/50" : "border-zinc-200 bg-white"
            )}>
              {/* Corner decorations */}
              <div className={cn("absolute top-0 left-0 w-4 h-4 border-t border-l", isDark ? "border-zinc-600" : "border-zinc-400")} />
              <div className={cn("absolute top-0 right-0 w-4 h-4 border-t border-r", isDark ? "border-zinc-600" : "border-zinc-400")} />
              <div className={cn("absolute bottom-0 left-0 w-4 h-4 border-b border-l", isDark ? "border-zinc-600" : "border-zinc-400")} />
              <div className={cn("absolute bottom-0 right-0 w-4 h-4 border-b border-r", isDark ? "border-zinc-600" : "border-zinc-400")} />

              <div className={cn(
                "text-6xl mb-6",
                isDark ? "text-zinc-700" : "text-zinc-300"
              )}>
                🚀
              </div>
              <h3 className={cn(
                "text-xl font-medium mb-4",
                isDark ? "text-zinc-100" : "text-zinc-900"
              )}>
                No Open Positions Right Now
              </h3>
              <p className={cn(
                "text-base mb-6 max-w-lg mx-auto",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )}>
                We don&apos;t have any paid positions available at the moment, but we&apos;re always excited to welcome new contributors to our open-source project!
              </p>
              <p className={cn(
                "text-sm",
                isDark ? "text-zinc-500" : "text-zinc-500"
              )}>
                Check out our GitHub to see how you can contribute.
              </p>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 px-6">
        <AnimatedSection className="max-w-4xl mx-auto text-center">
          <h2 className={cn(
            "text-3xl md:text-4xl font-extralight tracking-tight mb-6",
            isDark ? "text-zinc-100" : "text-zinc-900"
          )}>
            Become a Contributor
          </h2>
          <p className={cn(
            "text-lg mb-10 max-w-xl mx-auto",
            isDark ? "text-zinc-400" : "text-zinc-600"
          )}>
            The best way to join our team is to start contributing. Every PR counts!
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://github.com/stellarstack/stellarstack"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                className={cn(
                  "text-sm uppercase tracking-wider px-8 py-6 gap-2 transition-all hover:scale-[1.02]",
                  isDark
                    ? "bg-zinc-100 text-zinc-900 hover:bg-white"
                    : "bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                )}
              >
                <BsGithub className="w-4 h-4" />
                View Open Issues
              </Button>
            </a>
            <a href="https://discord.gg/stellarstack" target="_blank" rel="noopener noreferrer">
              <Button
                variant="outline"
                className={cn(
                  "text-sm uppercase tracking-wider px-8 py-6 gap-2",
                  isDark
                    ? "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                    : "border-zinc-300 text-zinc-700 hover:border-zinc-400"
                )}
              >
                Join Discord
                <BsArrowRight className="w-4 h-4" />
              </Button>
            </a>
          </div>
        </AnimatedSection>
      </section>

      <Footer isDark={isDark} />
    </div>
  );
};

export default CareersPage;
