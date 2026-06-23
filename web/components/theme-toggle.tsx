"use client";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // resolvedTheme is undefined on the server + first client render (matches SSR,
  // no hydration mismatch); next-themes fills it in right after mount.
  const isDark = resolvedTheme === "dark";

  return (
    <div className="flex items-center gap-2" title="Dag- / nachtmodus">
      <Sun
        className={cn(
          "size-4 transition-colors",
          isDark ? "text-[var(--v7-faint)]" : "text-[var(--v7-brand-primary)]",
        )}
        aria-hidden="true"
      />
      <Switch
        checked={isDark}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        aria-label="Wissel tussen dag- en nachtmodus"
      />
      <Moon
        className={cn(
          "size-4 transition-colors",
          isDark ? "text-[var(--v7-brand-primary)]" : "text-[var(--v7-faint)]",
        )}
        aria-hidden="true"
      />
    </div>
  );
}
