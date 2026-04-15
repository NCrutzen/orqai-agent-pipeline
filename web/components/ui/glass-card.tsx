import { cn } from "@/lib/utils";

export function GlassCard({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-[var(--v7-radius)]",
        "bg-[var(--v7-glass-bg)]",
        "border border-[var(--v7-glass-border)]",
        "backdrop-blur-[18px]",
        "shadow-[var(--v7-glass-shadow)]",
        "transition-all duration-200",
        className
      )}
      {...props}
    />
  );
}
