import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /** Renders the mark for placement on a wine background. */
  onWine?: boolean;
  showName?: boolean;
};

/** Elegant SVG Tooth Mark, tinted with currentColor. */
export function ToothMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-6 w-auto shrink-0 inline-block", className)}
    >
      <path d="M12 2C8.5 2 6 4.5 6 8c0 3.5 1.5 7.5 3 11 0.7 1.6 1.8 3 3 3s2.3-1.4 3-3c1.5-3.5 3-7.5 3-11 0-3.5-2.5-6-6-6z" />
      <path d="M12 5v5" />
      <path d="M9.5 11c1.5 1 3.5 1 5 0" />
    </svg>
  );
}

export function Logo({ className, onWine = false, showName = true }: LogoProps) {
  return (
    <div className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-full p-1.5",
          onWine ? "bg-white/10 text-white" : "bg-primary/10 text-primary",
        )}
      >
        <ToothMark className="h-6 w-6" />
      </div>
      {showName && (
        <div className="flex flex-col text-left leading-tight">
          <span
            className={cn(
              "font-display text-lg tracking-wide font-normal",
              onWine ? "text-white" : "text-foreground",
            )}
          >
            Dra. Michelle Tiago
          </span>
          <span
            className={cn(
              "text-[10px] uppercase tracking-widest font-medium",
              onWine ? "text-white/80" : "text-primary-soft",
            )}
          >
            Odontologia Estética
          </span>
        </div>
      )}
    </div>
  );
}
