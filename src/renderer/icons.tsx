// Minimal single-color line icons (SF Symbols-ish: thin stroke, rounded
// caps, currentColor) — used instead of emoji across the overlay/settings
// for a native-feeling, monochrome icon language rather than colorful glyphs.

type IconProps = { size?: number };

const base = {
  viewBox: "0 0 16 16",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconCamera({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M5.5 4 6.3 2.6h3.4L10.5 4H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h2.5Z" />
      <circle cx="8" cy="8.2" r="2.3" />
    </svg>
  );
}

export function IconPlay({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M4.5 2.8a.8.8 0 0 1 1.22-.68l7.3 4.7a1.4 1.4 0 0 1 0 2.36l-7.3 4.7A.8.8 0 0 1 4.5 13.2z" />
    </svg>
  );
}

export function IconPause({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <rect x="4" y="2.5" width="2.6" height="11" rx="1" />
      <rect x="9.4" y="2.5" width="2.6" height="11" rx="1" />
    </svg>
  );
}

export function IconSun({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.3v1.6M8 13.1v1.6M14.7 8h-1.6M2.9 8H1.3M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1M12.7 12.7l-1.1-1.1M4.4 4.4 3.3 3.3" />
    </svg>
  );
}

export function IconMoon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.8 9.7A6 6 0 0 1 6.3 2.2a6 6 0 1 0 7.5 7.5Z" />
    </svg>
  );
}

export function IconNotes({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <rect x="3" y="2" width="10" height="12" rx="1.5" />
      <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
    </svg>
  );
}

export function IconPin({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M9.5 2.2 13.8 6.5l-2.1.6-2.4 2.4.3 3-1.4 1.4L5 10.7l-3 3 .6-4.2 3.2-3.2-.2-2.6 1.4-1.4 2.5 0Z" />
    </svg>
  );
}

export function IconHelp({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M6.2 6.3a1.9 1.9 0 0 1 3.7.5c0 1.2-1.9 1.4-1.9 2.6" />
      <circle cx="8" cy="11.6" r="0.5" fill="currentColor" />
    </svg>
  );
}

export function IconCopy({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
    </svg>
  );
}

export function IconGear({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base} aria-hidden="true">
      <circle cx="8" cy="8" r="2.1" />
      <path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" />
      <circle cx="8" cy="8" r="4.3" />
    </svg>
  );
}

/** Small triangle for "previous" / "next" and for disclosure rows; rotated by CSS. */
export function IconChevron({ size = 10, direction = "right" }: IconProps & { direction?: "left" | "right" | "down" }) {
  const rotate = direction === "left" ? 180 : direction === "down" ? 90 : 0;
  return (
    <svg width={size} height={size} {...base} aria-hidden="true" style={{ transform: `rotate(${rotate}deg)` }}>
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

export function IconCheck({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} {...base} aria-hidden="true">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}
