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

/** The exact official tooth mark from Dra. Michelle's brand identity. */
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
      alt="Marca Odontologia Dra. Michelle"
      className={cn("h-7 w-auto shrink-0 inline-block object-contain", className)}
    />
  );
}

/** The exact official logo with signature typography and tooth mark. */
export function Logo({ className, onWine = false, showName = true }: LogoProps) {
  if (!showName) {
    return <ToothMark className="h-8" onWine={onWine} />;
  }

  return (
    <img
      src={onWine ? logoWhite : logoWine}
      alt="Dra. Michelle Barbosa Tiago — Odontologia Estética"
      className={cn("h-10 w-auto sm:h-11 object-contain", className)}
      loading="eager"
      decoding="async"
    />
  );
}
