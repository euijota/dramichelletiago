import { cn } from "@/lib/utils";

/** SVG tooth mark - inline, ~1KB vs 34KB PNG */
export function ToothMark({ className, onWine = false }: { className?: string; onWine?: boolean }) {
  const color = onWine ? "#fff" : "#8a4a52";
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-7 w-auto shrink-0 inline-block", className)}
      role="img"
      aria-label="Marca Dra. Michelle Tiago"
    >
      <path
        d="M60 15C41.67 15 27 29.67 27 48C27 57.5 36.5 65 48 72.5C59.5 65 69 57.5 69 48C69 29.67 54.33 15 36 15H60Z"
        fill={color}
      />
      <path
        d="M60 15C78.33 15 93 29.67 93 48C93 57.5 83.5 65 72 72.5C60.5 65 51 57.5 51 48C51 29.67 65.67 15 84 15H60Z"
        fill={color}
        opacity="0.6"
      />
      <ellipse cx={60} cy={48} rx={12} ry={8} fill="#fff" opacity={onWine ? 0.2 : 0.3} />
    </svg>
  );
}

/** SVG Logo - inline signature + tooth mark, ~2KB vs 34KB PNG */
export function Logo({ className, onWine = false, showName = true }: { className?: string; onWine?: boolean; showName?: boolean }) {
  const textColor = onWine ? "#fff" : "#8a4a52";
  const accentColor = onWine ? "#fff" : "#8a4a52";

  if (!showName) {
    return <ToothMark className="h-8" onWine={onWine} />;
  }

  return (
    <svg
      viewBox="0 0 280 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        "h-10 w-auto max-w-[180px] shrink-0 object-contain sm:h-12 sm:max-w-[220px]",
        className,
      )}
      role="img"
      aria-label="Dra. Michelle Barbosa Tiago — Odontologia Estética"
    >
      {/* Script "Michelle" */}
      <text
        x="10"
        y="52"
        fontFamily="Georgia, serif"
        fontSize="32"
        fontWeight="400"
        fontStyle="italic"
        fill={textColor}
        style={{ fontFeatureSettings: '"liga" 1, "calt" 1' }}
      >
        Michelle
      </text>
      {/* "Dra. Barbosa Tiago" */}
      <text
        x="10"
        y="68"
        fontFamily="system-ui, sans-serif"
        fontSize="11"
        fontWeight="500"
        letterSpacing="0.15em"
        textTransform="uppercase"
        fill={textColor}
        opacity="0.8"
      >
        Dra. Barbosa Tiago
      </text>
      {/* Tooth mark */}
      <g transform="translate(180, 12)">
        <path
          d="M30 0C20.5 0 12 8.5 12 18C12 23.5 18.5 28 24 31.5C29.5 28 36 23.5 36 18C36 8.5 27.5 0 18 0H30Z"
          fill={accentColor}
        />
        <path
          d="M30 0C39.5 0 48 8.5 48 18C48 23.5 41.5 28 36 31.5C30.5 28 24 23.5 24 18C24 8.5 32.5 0 42 0H30Z"
          fill={accentColor}
          opacity="0.6"
        />
        <ellipse cx={30} cy={18} rx={6} ry={4} fill="#fff" opacity={onWine ? 0.2 : 0.3} />
      </g>
    </svg>
  );
}