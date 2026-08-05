import { cn } from "@/lib/utils";
import logoWine from "@/assets/logo-wine.png";
import logoWhite from "@/assets/logo-white.png";
import toothWine from "@/assets/tooth-wine.png";
import toothWhite from "@/assets/tooth.png";

type LogoProps = {
  className?: string;
  /** Renders the mark for placement on a wine background. */
  onWine?: boolean;
  showName?: boolean;
};

/** Exact tooth mark from the Canva brand design. */
export function ToothMark({
  className,
  onWine = false,
}: {
  className?: string;
  onWine?: boolean;
}) {
  return (
    <img
      src={onWine ? toothWhite : toothWine}
      alt="Marca Dra. Michelle Tiago"
      className={cn("h-7 w-auto shrink-0 inline-block object-contain", className)}
    />
  );
}

/** Exact original Canva logo (signature + tooth mark). */
export function Logo({ className, onWine = false, showName = true }: LogoProps) {
  if (!showName) {
    return <ToothMark className="h-8" onWine={onWine} />;
  }

  return (
    <img
      src={onWine ? logoWhite : logoWine}
      alt="Dra. Michelle Barbosa Tiago — Odontologia Estética"
      className={cn("h-10 w-auto sm:h-12 object-contain", className)}
      loading="eager"
      decoding="async"
    />
  );
}
