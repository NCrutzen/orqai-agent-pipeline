"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Ticket, Settings, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/app/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSelector } from "@/components/app/language-selector";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n";
import type { User } from "@supabase/supabase-js";

interface AppNavProps {
  user: User;
  locale: Locale;
  dict: Dictionary;
  hasAnyUnread: boolean;
}

export function AppNav({ user: _user, locale, dict, hasAnyUnread }: AppNavProps) {
  const pathname = usePathname();

  const navItems = [
    { href: "/app/submit", label: dict.nav.submit, icon: PlusCircle },
    { href: "/app/tickets", label: dict.nav.tickets, icon: Ticket },
    { href: "/app/settings", label: dict.nav.settings, icon: Settings },
  ];

  function isActive(href: string): boolean {
    if (href === "/app/tickets") return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Desktop: h-14 top bar, hidden on mobile */}
      <header className="hidden md:flex h-14 items-center border-b border-[var(--v7-line)] bg-[var(--v7-bg)] px-8 gap-8">
        <Image
          src="/brand/moyne-roberts-logo.png"
          alt="Moyne Roberts"
          height={24}
          width={120}
          className="h-6 w-auto"
        />
        <nav aria-label={dict.nav.mainNav} className="flex items-center gap-6 flex-1">
          {navItems.map((item) => {
            const isTickets = item.href === "/app/tickets";
            const showDot = isTickets && hasAnyUnread;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                aria-label={showDot ? dict.tickets.navLabelUnread : undefined}
                className={cn(
                  "relative text-sm font-normal tracking-wide uppercase transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v7-brand-primary)]",
                  isActive(item.href)
                    ? "text-[var(--v7-text)] font-semibold border-b-2 border-[var(--v7-brand-primary)]"
                    : "text-[var(--v7-muted)] hover:text-[var(--v7-text)]"
                )}
              >
                {item.label}
                {showDot && (
                  <span
                    className="absolute top-0 -right-1.5 size-1.5 rounded-full bg-[var(--v7-brand-primary)]"
                    aria-hidden="true"
                  />
                )}
              </Link>
            );
          })}
        </nav>
        <LanguageSelector locale={locale} label={dict.nav.languageLabel} compact />
        <ThemeToggle />
        <LogoutButton label={dict.nav.logout} failedMessage={dict.logout.failed} />
      </header>

      {/* Mobile: minimal top strip with logo + controls */}
      <div className="md:hidden h-10 px-4 flex items-center justify-between border-b border-[var(--v7-line)] bg-[var(--v7-bg)]">
        <Image
          src="/brand/moyne-roberts-logo.png"
          alt="Moyne Roberts"
          height={20}
          width={100}
          className="h-5 w-auto"
        />
        <div className="flex items-center gap-1">
          <LanguageSelector locale={locale} label={dict.nav.languageLabel} compact />
          <ThemeToggle />
          <LogoutButton label={dict.nav.logout} failedMessage={dict.logout.failed} />
        </div>
      </div>

      {/* Mobile: bottom fixed nav */}
      <nav
        aria-label={dict.nav.mainNav}
        className="md:hidden fixed bottom-0 inset-x-0 z-50 h-16 border-t border-[var(--v7-line)] bg-[var(--v7-panel)] flex pb-[env(safe-area-inset-bottom,0px)]"
      >
        {navItems.map((item) => {
          const isTickets = item.href === "/app/tickets";
          const showDot = isTickets && hasAnyUnread;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              aria-label={showDot ? dict.tickets.navLabelUnread : undefined}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-2 min-h-[44px] min-w-[44px]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v7-brand-primary)]",
                isActive(item.href)
                  ? "text-[var(--v7-brand-primary)] font-semibold"
                  : "text-[var(--v7-muted)]"
              )}
            >
              <span className="relative">
                <item.icon className="size-5" aria-hidden="true" />
                {showDot && (
                  <span
                    className="absolute top-0 right-0 size-1.5 rounded-full bg-[var(--v7-brand-primary)]"
                    aria-hidden="true"
                  />
                )}
              </span>
              <span className="text-sm font-normal tracking-wide uppercase">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
