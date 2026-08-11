import { cn } from "@/lib/utils";
import logoWineImg from "@/assets/logo-wine.png";
import logoWhiteImg from "@/assets/logo-white.png";
import toothWineImg from "@/assets/tooth-wine.png";
import toothWhiteImg from "@/assets/tooth.png";

/** Marca da borboleta/dente oficial da Dra. Michelle */
export function ToothMark({ className, onWine = false }: { className?: string; onWine?: boolean }) {
  return (
    <img
      src={onWine ? toothWhiteImg : toothWineImg}
      alt="Marca Dra. Michelle Barbosa Tiago"
      className={cn("h-7 w-auto shrink-0 inline-block object-contain", className)}
    />
  );
}

/** Logomarca oficial da Dra. Michelle Barbosa Tiago */
export function Logo({
  className,
  onWine = false,
  showName = true,
}: {
  className?: string;
  onWine?: boolean;
  showName?: boolean;
}) {
  if (!showName) {
    return <ToothMark className="h-8" onWine={onWine} />;
  }

  return (
    <img
      src={onWine ? logoWhiteImg : logoWineImg}
      alt="Dra. Michelle Barbosa Tiago — Odontologia Estética"
      className={cn(
        "h-10 w-auto max-w-[200px] shrink-0 object-contain sm:h-14 sm:max-w-[260px]",
        className,
      )}
    />
  );
}
