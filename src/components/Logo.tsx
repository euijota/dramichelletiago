import { cn } from "@/lib/utils";
import logoWine from "@/assets/logo-wine.png.asset.json";
import logoWhite from "@/assets/logo-white.png.asset.json";
import toothMask from "@/assets/tooth.png.asset.json";

type LogoProps = {
  className?: string;
  /** Renders the mark for placement on a wine background. */
  onWine?: boolean;
  showName?: boolean;
};

/** The exact tooth mark from Dra. Michelle's official logo, tinted with currentColor. */
export function ToothMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-6 shrink-0 bg-current", className)}
      style={{
        aspectRatio: "75 / 71",
        WebkitMaskImage: `url(${toothMask.url})`,
        maskImage: `url(${toothMask.url})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}

export function Logo({ className, onWine = false, showName = true }: LogoProps) {
  if (!showName) {
    return (
      <span
        className={cn(
          "inline-flex items-center",
          onWine ? "text-primary-foreground" : "text-primary",
          className,
        )}
      >
        <ToothMark className="h-6" />
      </span>
    );
  }

  return (
    <img
      src={onWine ? logoWhite.url : logoWine.url}
      alt="Dra. Michelle Barbosa Tiago"
      className={cn("h-9 w-auto sm:h-10", className)}
      loading="eager"
      decoding="async"
    />
  );
}
