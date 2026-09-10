/// Minimal line icons, stroked in currentColor so they inherit the
/// silver/gold palette instead of dropping full-color emoji into a
/// monochrome dark theme.

interface IconProps {
  size?: number;
}

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

export function StoreIcon({ size = 22 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M3 9.5 4.5 4h15L21 9.5" />
      <path d="M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      <path d="M5 12v8h14v-8" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

export function CardIcon({ size = 22 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </svg>
  );
}

export function LockIcon({ size = 22 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <rect x="4" y="10" width="16" height="11" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15.5" r="1.2" />
    </svg>
  );
}

export function ShieldIcon({ size = 22 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M12 2.5 20 6v6c0 5-3.4 8.4-8 9.5C7.4 20.4 4 17 4 12V6l8-3.5Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function ChainIcon({ size = 22 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M10 13.5a4 4 0 0 0 5.7.4l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.5 1.5" />
      <path d="M14 10.5a4 4 0 0 0-5.7-.4l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.5-1.5" />
    </svg>
  );
}

export function ClockIcon({ size = 22 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.5l3.5 2" />
    </svg>
  );
}

export function ChartIcon({ size = 22 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <rect x="8" y="12" width="3" height="5" rx="0.6" />
      <rect x="14" y="8" width="3" height="9" rx="0.6" />
    </svg>
  );
}

export function CoinIcon({ size = 22 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <ellipse cx="12" cy="12" rx="6" ry="9" />
      <ellipse cx="12" cy="12" rx="2.6" ry="6" />
      <path d="M12 3c3.3 0 6 4 6 9s-2.7 9-6 9" />
    </svg>
  );
}

export function BookIcon({ size = 22 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4 4.5A2 2 0 0 1 6 3h13v15H6a2 2 0 0 0-2 2V4.5Z" />
      <path d="M19 18v3H6a2 2 0 0 1 0-4" />
      <path d="M9 8h6" />
    </svg>
  );
}
