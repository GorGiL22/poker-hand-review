const CARD_SIZE_STYLES = {
  xs: {
    box: "h-8 w-[1.35rem] rounded-[5px]",
    rank: "text-[0.5rem]",
    cornerSuit: "text-[0.4rem]",
    centerSuit: "text-[0.85rem]",
    corner: "left-0.5 top-0.5 gap-0",
    cornerBottom: "bottom-0.5 right-0.5 gap-0",
  },
  sm: {
    box: "h-10 w-7 rounded-md",
    rank: "text-[0.6rem]",
    cornerSuit: "text-[0.45rem]",
    centerSuit: "text-[1rem]",
    corner: "left-0.5 top-0.5 gap-0",
    cornerBottom: "bottom-0.5 right-0.5 gap-0",
  },
  md: {
    box: "h-16 w-11 rounded-lg",
    rank: "text-[1.05rem]",
    cornerSuit: "text-[0.55rem]",
    centerSuit: "text-[1.65rem]",
    corner: "left-1 top-1 gap-0",
    cornerBottom: "bottom-1 right-1 gap-0",
  },
} as const;

export type PhrCardSize = keyof typeof CARD_SIZE_STYLES;

type PhrPlayingCardProps = {
  card: string;
  size?: PhrCardSize;
};

export function PhrPlayingCard({ card, size = "md" }: PhrPlayingCardProps) {
  const rank = card.slice(0, -1).toUpperCase();
  const suit = card.slice(-1).toLowerCase();
  const suitMap: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
  const symbol = suitMap[suit] ?? "?";
  const isRed = suit === "h" || suit === "d";
  const tone = isRed ? "text-rose-600" : "text-zinc-900";
  const s = CARD_SIZE_STYLES[size];

  const corner = (
    <span className={`flex flex-col items-center leading-none ${tone}`}>
      <span className={`font-black tabular-nums tracking-tighter ${s.rank}`}>{rank}</span>
      <span className={`leading-none ${s.cornerSuit}`} aria-hidden>
        {symbol}
      </span>
    </span>
  );

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center border border-zinc-200/90 bg-gradient-to-br from-white via-white to-zinc-100 shadow-[0_4px_10px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.95)] ring-1 ring-zinc-950/5 ${s.box}`}
    >
      <span className={`absolute ${s.corner}`}>{corner}</span>
      <span className={`select-none leading-none ${tone} ${s.centerSuit}`} aria-hidden>
        {symbol}
      </span>
      <span className={`absolute rotate-180 ${s.cornerBottom}`}>{corner}</span>
    </span>
  );
}

export function PhrCardBack({ size = "md" }: { size?: PhrCardSize }) {
  const s = CARD_SIZE_STYLES[size];
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center border border-rose-300/40 bg-gradient-to-br from-rose-600 via-rose-700 to-red-950 shadow-[0_4px_10px_rgba(0,0,0,0.28)] ${s.box}`}
    >
      <span
        className={`rounded-[3px] border border-rose-200/35 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.2)_1px,_transparent_1px)] bg-[length:3px_3px] ${
          size === "xs" ? "h-5 w-3" : size === "sm" ? "h-6 w-4" : "h-9 w-6"
        }`}
      />
    </span>
  );
}
