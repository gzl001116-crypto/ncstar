import { hash } from "../utils";

const PALETTES = [
  ["#4f46e5", "#c7d2fe", "#eef2ff", "#312e81"],
  ["#0ea5e9", "#bae6fd", "#f0f9ff", "#0c4a6e"],
  ["#f43f5e", "#fecdd3", "#fff1f2", "#9f1239"],
  ["#10b981", "#a7f3d0", "#ecfdf5", "#064e3b"],
  ["#f59e0b", "#fde68a", "#fffbeb", "#92400e"],
  ["#8b5cf6", "#ddd6fe", "#f5f3ff", "#4c1d95"],
];

export function palette(id: string) {
  return PALETTES[hash(id) % PALETTES.length];
}

export function Cover({ id, ratio = "4 / 5", className = "" }: { id: string; ratio?: string; className?: string }) {
  const [ink, paper, mist, deep] = palette(id);
  const n = hash(id);
  const pattern = n % 5;

  return (
    <div className={`cover ${className}`} style={{ aspectRatio: ratio, background: deep }}>
      <svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {pattern === 0 && (
          <>
            <circle cx="250" cy="180" r="150" fill={ink} />
            <circle cx="250" cy="180" r="90" fill="none" stroke={paper} strokeWidth="14" />
            <circle cx="90" cy="390" r="70" fill={mist} />
          </>
        )}
        {pattern === 1 && (
          <>
            <path d="M0 380 C80 300 140 430 220 340 C300 250 330 280 400 180 L400 500 L0 500 Z" fill={ink} />
            <path d="M0 120 H400" stroke={paper} strokeWidth="10" />
            <path d="M0 150 H260" stroke={mist} strokeWidth="6" />
            <circle cx="310" cy="90" r="36" fill={paper} />
          </>
        )}
        {pattern === 2 && (
          <>
            {Array.from({ length: 8 }).map((_, index) => (
              <path
                key={index}
                d={`M-20 ${40 + index * 58} H420`}
                stroke={index % 2 ? mist : paper}
                strokeWidth={index % 3 === 0 ? 8 : 2}
                opacity={index % 2 ? 0.45 : 0.85}
              />
            ))}
            <rect x="48" y="70" width="180" height="250" fill={ink} />
          </>
        )}
        {pattern === 3 && (
          <>
            <rect x="36" y="36" width="150" height="210" fill={paper} />
            <rect x="160" y="150" width="190" height="250" fill={ink} />
            <circle cx="300" cy="90" r="48" fill={mist} />
          </>
        )}
        {pattern === 4 && (
          <>
            {Array.from({ length: 6 }).map((_, row) =>
              Array.from({ length: 5 }).map((__, col) => (
                <circle
                  key={`${row}-${col}`}
                  cx={50 + col * 75}
                  cy={60 + row * 75}
                  r={(row + col) % 3 === 0 ? 16 : 6}
                  fill={(row + col) % 2 === 0 ? paper : mist}
                />
              )),
            )}
          </>
        )}
      </svg>
    </div>
  );
}

export function Avatar({ name, id, size = 44 }: { name: string; id: string; size?: number }) {
  const [ink, , mist] = palette(id);
  return (
    <span className="avatar" style={{ width: size, height: size, background: ink, color: mist, fontSize: size * 0.42 }}>
      {name.slice(0, 1)}
    </span>
  );
}
