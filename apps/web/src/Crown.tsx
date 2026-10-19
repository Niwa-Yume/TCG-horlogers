// Couronne cannelée des maquettes (Main.dc.html, Remontage.dc.html).
const r2 = (n: number) => Math.round(n * 100) / 100;
let teeth = '';
for (let i = 0; i < 40; i++) {
  const a0 = ((i * 9 - 2.4) * Math.PI) / 180;
  const a1 = ((i * 9 + 2.4) * Math.PI) / 180;
  const p = (r: number, a: number) => r2(70 + r * Math.sin(a)) + ' ' + r2(70 - r * Math.cos(a));
  teeth += 'M' + p(56, a0) + 'L' + p(69, a0) + 'L' + p(69, a1) + 'L' + p(56, a1) + 'Z';
}

export function CrownSvg({
  size,
  rot = 0,
  pointer = false,
}: {
  size: number;
  rot?: number;
  pointer?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      aria-hidden="true"
      style={{ display: 'block', transform: `rotate(${rot}deg)`, transition: 'transform 90ms steps(2, end)' }}
    >
      <circle cx="70" cy="70" r="64" fill="var(--ink)" />
      <path d={teeth} fill="var(--ink)" stroke="var(--paper)" strokeWidth="0.8" />
      <circle cx="70" cy="70" r="50" fill="var(--ink)" stroke="var(--paper)" strokeWidth="0.8" />
      <circle cx="70" cy="70" r="40" fill="none" stroke="var(--paper)" strokeWidth="0.5" />
      {pointer && <path d="M70 26 L73 34 L67 34 Z" fill="var(--paper)" />}
      <text
        x="70"
        y="78"
        textAnchor="middle"
        fontFamily="Big Shoulders, Arial Narrow, sans-serif"
        fontWeight="900"
        fontSize="22"
        fill="var(--paper)"
      >
        WM
      </text>
    </svg>
  );
}
