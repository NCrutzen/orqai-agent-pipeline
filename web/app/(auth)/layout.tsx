import type { ReactNode } from "react";
import {
  Bot,
  Sparkles,
  Brain,
  Cpu,
  Zap,
  Network,
  Workflow,
  Cog,
  MessageSquare,
  GitBranch,
  Terminal,
  Atom,
  CircuitBoard,
  Command,
  Layers,
  Radio,
} from "lucide-react";

// Moyne Roberts brand palette
const MR_NAVY = "#071c2e";
const MR_ORANGE = "#dc4c19";
const MR_BLUE = "#4a90e2";
const MR_PALE = "#e9eff8";

type FloatIcon = {
  Icon: typeof Bot;
  top: string;
  left: string;
  size: number;
  color: string;
  opacity: number;
  drift: string;
  duration: string;
  delay: string;
  rotate: string;
};

const ICONS: FloatIcon[] = [
  { Icon: Bot, top: "8%", left: "6%", size: 84, color: MR_ORANGE, opacity: 0.85, drift: "float-a", duration: "14s", delay: "0s", rotate: "-8deg" },
  { Icon: Sparkles, top: "14%", left: "78%", size: 64, color: MR_BLUE, opacity: 0.9, drift: "float-b", duration: "11s", delay: "1s", rotate: "12deg" },
  { Icon: Brain, top: "28%", left: "12%", size: 96, color: MR_PALE, opacity: 0.75, drift: "float-c", duration: "18s", delay: "2s", rotate: "6deg" },
  { Icon: Cpu, top: "24%", left: "66%", size: 72, color: MR_ORANGE, opacity: 0.85, drift: "float-a", duration: "13s", delay: "3s", rotate: "-14deg" },
  { Icon: Zap, top: "46%", left: "4%", size: 60, color: MR_ORANGE, opacity: 0.95, drift: "float-b", duration: "10s", delay: "0.5s", rotate: "-20deg" },
  { Icon: Network, top: "44%", left: "86%", size: 88, color: MR_BLUE, opacity: 0.85, drift: "float-c", duration: "17s", delay: "4s", rotate: "10deg" },
  { Icon: Workflow, top: "62%", left: "16%", size: 76, color: MR_PALE, opacity: 0.8, drift: "float-a", duration: "15s", delay: "1.5s", rotate: "-6deg" },
  { Icon: Cog, top: "68%", left: "74%", size: 100, color: MR_ORANGE, opacity: 0.75, drift: "float-spin", duration: "24s", delay: "0s", rotate: "0deg" },
  { Icon: MessageSquare, top: "82%", left: "36%", size: 64, color: MR_BLUE, opacity: 0.9, drift: "float-b", duration: "12s", delay: "2.5s", rotate: "8deg" },
  { Icon: GitBranch, top: "16%", left: "42%", size: 56, color: MR_PALE, opacity: 0.85, drift: "float-c", duration: "16s", delay: "3.5s", rotate: "-10deg" },
  { Icon: Terminal, top: "86%", left: "8%", size: 68, color: MR_BLUE, opacity: 0.9, drift: "float-a", duration: "13s", delay: "1s", rotate: "4deg" },
  { Icon: Atom, top: "78%", left: "58%", size: 84, color: MR_ORANGE, opacity: 0.85, drift: "float-spin", duration: "20s", delay: "0s", rotate: "0deg" },
  { Icon: CircuitBoard, top: "52%", left: "48%", size: 92, color: MR_PALE, opacity: 0.65, drift: "float-c", duration: "19s", delay: "5s", rotate: "14deg" },
  { Icon: Command, top: "6%", left: "46%", size: 52, color: MR_ORANGE, opacity: 0.9, drift: "float-b", duration: "11s", delay: "4s", rotate: "-4deg" },
  { Icon: Layers, top: "34%", left: "36%", size: 60, color: MR_BLUE, opacity: 0.85, drift: "float-a", duration: "15s", delay: "2s", rotate: "18deg" },
  { Icon: Radio, top: "66%", left: "92%", size: 56, color: MR_ORANGE, opacity: 0.9, drift: "float-b", duration: "12s", delay: "3s", rotate: "-16deg" },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative min-h-screen overflow-hidden text-white"
      style={{ background: MR_NAVY }}
    >
      <style>{`
        @keyframes orb-a {
          0%   { transform: translate3d(-10%, -5%, 0) scale(1); }
          50%  { transform: translate3d(20%, 25%, 0) scale(1.25); }
          100% { transform: translate3d(-10%, -5%, 0) scale(1); }
        }
        @keyframes orb-b {
          0%   { transform: translate3d(10%, 15%, 0) scale(1.05); }
          50%  { transform: translate3d(-25%, -20%, 0) scale(1.3); }
          100% { transform: translate3d(10%, 15%, 0) scale(1.05); }
        }
        @keyframes orb-c {
          0%   { transform: translate3d(0, 0, 0) scale(1); }
          33%  { transform: translate3d(25%, -25%, 0) scale(1.2); }
          66%  { transform: translate3d(-20%, 20%, 0) scale(0.9); }
          100% { transform: translate3d(0, 0, 0) scale(1); }
        }
        @keyframes conic-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes grid-pan {
          from { background-position: 0 0; }
          to   { background-position: 64px 64px; }
        }
        @keyframes shimmer-sweep {
          0%   { transform: translateX(-120%); opacity: 0; }
          35%  { opacity: 0.9; }
          65%  { opacity: 0.9; }
          100% { transform: translateX(120%); opacity: 0; }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.45; filter: blur(90px); }
          50%      { opacity: 0.85; filter: blur(110px); }
        }
        @keyframes float-a {
          0%, 100% { transform: translate(0, 0) rotate(var(--rot, 0deg)); }
          25%      { transform: translate(-22px, -26px) rotate(calc(var(--rot, 0deg) + 8deg)); }
          50%      { transform: translate(24px, -18px) rotate(calc(var(--rot, 0deg) - 6deg)); }
          75%      { transform: translate(12px, 22px) rotate(calc(var(--rot, 0deg) + 4deg)); }
        }
        @keyframes float-b {
          0%, 100% { transform: translate(0, 0) rotate(var(--rot, 0deg)); }
          33%      { transform: translate(26px, 18px) rotate(calc(var(--rot, 0deg) - 10deg)); }
          66%      { transform: translate(-20px, 26px) rotate(calc(var(--rot, 0deg) + 12deg)); }
        }
        @keyframes float-c {
          0%, 100% { transform: translate(0, 0) rotate(var(--rot, 0deg)) scale(1); }
          50%      { transform: translate(-28px, -28px) rotate(calc(var(--rot, 0deg) + 14deg)) scale(1.1); }
        }
        @keyframes float-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes icon-pulse {
          0%, 100% { filter: drop-shadow(0 0 10px currentColor); }
          50%      { filter: drop-shadow(0 0 28px currentColor); }
        }
        @keyframes card-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-8px); }
        }
        @keyframes line-sweep {
          0%   { transform: translateY(-10%); opacity: 0; }
          10%  { opacity: 0.7; }
          90%  { opacity: 0.7; }
          100% { transform: translateY(110%); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-anim, .auth-icon { animation: none !important; }
        }
      `}</style>

      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* Rotating conic aurora — MR navy / orange / blue sweep */}
        <div
          className="auth-anim absolute left-1/2 top-1/2 h-[200vmax] w-[200vmax] opacity-[0.55]"
          style={{
            background: `conic-gradient(from 0deg at 50% 50%, ${MR_ORANGE} 0deg, transparent 60deg, ${MR_BLUE} 140deg, transparent 220deg, ${MR_ORANGE} 300deg, transparent 360deg)`,
            filter: "blur(140px)",
            animation: "conic-spin 45s linear infinite",
          }}
        />

        {/* Three big glow orbs with pulse */}
        <div
          className="auth-anim absolute left-[8%] top-[12%] h-[640px] w-[640px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${MR_ORANGE} 0%, transparent 65%)`,
            animation:
              "orb-a 22s ease-in-out infinite, pulse-glow 8s ease-in-out infinite",
          }}
        />
        <div
          className="auth-anim absolute right-[6%] top-[30%] h-[600px] w-[600px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${MR_BLUE} 0%, transparent 65%)`,
            animation:
              "orb-b 26s ease-in-out infinite, pulse-glow 10s ease-in-out infinite",
            animationDelay: "0s, 2s",
          }}
        />
        <div
          className="auth-anim absolute left-[28%] bottom-[4%] h-[580px] w-[580px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${MR_ORANGE} 0%, transparent 65%)`,
            animation:
              "orb-c 30s ease-in-out infinite, pulse-glow 12s ease-in-out infinite",
            animationDelay: "0s, 4s",
          }}
        />

        {/* Panning grid */}
        <div
          className="auth-anim absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            animation: "grid-pan 18s linear infinite",
          }}
        />

        {/* Horizontal scan line — orange beam */}
        <div
          className="auth-anim absolute inset-x-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${MR_ORANGE} 50%, transparent 100%)`,
            boxShadow: `0 0 32px ${MR_ORANGE}`,
            animation: "line-sweep 7s linear infinite",
          }}
        />

        {/* Diagonal shimmer */}
        <div
          className="auth-anim absolute inset-y-0 -inset-x-1/2 opacity-0"
          style={{
            background:
              "linear-gradient(110deg, transparent 40%, rgba(255,255,255,0.14) 50%, transparent 60%)",
            animation: "shimmer-sweep 6s ease-in-out infinite",
            animationDelay: "1s",
          }}
        />

        {/* Agent icon field — z above orbs, below card */}
        <div className="absolute inset-0 z-[5]">
          {ICONS.map((cfg, i) => {
            const { Icon } = cfg;
            return (
              <div
                key={i}
                className="auth-icon absolute"
                style={{
                  top: cfg.top,
                  left: cfg.left,
                  color: cfg.color,
                  opacity: cfg.opacity,
                  // @ts-expect-error — CSS custom property for keyframe
                  "--rot": cfg.rotate,
                  animation: `${cfg.drift} ${cfg.duration} ease-in-out ${cfg.delay} infinite, icon-pulse ${parseFloat(cfg.duration) * 0.6}s ease-in-out ${cfg.delay} infinite`,
                }}
              >
                <Icon
                  size={cfg.size}
                  strokeWidth={1.5}
                  style={{ transform: `rotate(${cfg.rotate})` }}
                />
              </div>
            );
          })}
        </div>

        {/* Light vignette — subtle so icons stay visible */}
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at center, transparent 0%, transparent 55%, ${MR_NAVY}cc 100%)`,
          }}
        />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div
          className="auth-anim"
          style={{ animation: "card-float 7s ease-in-out infinite" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
