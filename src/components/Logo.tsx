import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /** Renders the mark for placement on a wine background. */
  onWine?: boolean;
  showName?: boolean;
};

/** Exact vector tooth mark tinted with currentColor (100% crisp on any resolution). */
export function ToothMark({
  className,
  onWine = false,
}: {
  className?: string;
  onWine?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      fill="currentColor"
      className={cn(
        "h-7 w-auto shrink-0 inline-block",
        onWine ? "text-white" : "text-primary",
        className,
      )}
    >
      {/* Official smooth molar tooth vector shape */}
      <path d="M 50 12 C 32 12 18 26 18 48 C 18 64 25 80 34 92 C 39 98 46 97 48 88 C 50 78 50 78 52 88 C 54 97 61 98 66 92 C 75 80 82 64 82 48 C 82 26 68 12 50 12 Z M 50 28 C 42 28 35 32 33 36 C 32 38 33 40 36 42 C 40 44 45 45 50 45 C 55 45 60 44 64 42 C 67 40 68 38 67 36 C 65 32 58 28 50 28 Z" />
    </svg>
  );
}

/** Official brand logo with vector typography (Parisienne) and vector tooth mark. */
export function Logo({ className, onWine = false, showName = true }: LogoProps) {
  if (!showName) {
    return <ToothMark className="h-8" onWine={onWine} />;
  }

  return (
    <div className={cn("inline-flex items-center gap-3 select-none", className)}>
      <ToothMark className={cn("h-7 w-auto", onWine ? "text-white" : "text-primary")} />
      <div className="flex flex-col text-left leading-none">
        <span
          className={cn(
            "font-script text-2xl sm:text-3xl font-normal tracking-wide",
            onWine ? "text-white" : "text-primary",
          )}
        >
          Dra. Michelle Barbosa Tiago
        </span>
        <span
          className={cn(
            "text-[9px] uppercase tracking-[0.25em] font-semibold mt-1",
            onWine ? "text-white/80" : "text-primary-soft",
          )}
        >
          Odontologia Estética
        </span>
      </div>
    </div>
  );
}
