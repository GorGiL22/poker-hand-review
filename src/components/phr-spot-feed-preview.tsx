import { PhrCardBack, PhrPlayingCard } from "@/components/phr-playing-card";
import type { PublicHandPost } from "@/lib/phr-public-feed";

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length >= 2);
}

function extractHeroCards(hand: Record<string, unknown>): string[] {
  const heroName = typeof hand.heroName === "string" ? hand.heroName : null;
  if (!heroName) return [];
  const hole = hand.holeCardsByPlayer;
  if (!hole || typeof hole !== "object") return [];
  const cards = (hole as Record<string, unknown>)[heroName];
  return readStringArray(cards).slice(0, 2);
}

export function getSpotPreviewFromPost(post: PublicHandPost): {
  visibleBoard: string[];
  potLabel: string;
  heroCards: string[];
} {
  const hand = post.hand;
  const replay =
    hand.phrReplayAtPublish && typeof hand.phrReplayAtPublish === "object"
      ? (hand.phrReplayAtPublish as Record<string, unknown>)
      : null;

  const board =
    readStringArray(post.spotMeta?.visibleBoard).length > 0
      ? readStringArray(post.spotMeta?.visibleBoard)
      : readStringArray(replay?.visibleBoard).length > 0
        ? readStringArray(replay?.visibleBoard)
        : readStringArray(hand.visibleBoard);

  const potLabel =
    (typeof post.spotMeta?.potLabel === "string" && post.spotMeta.potLabel.trim()) ||
    (typeof replay?.potLabel === "string" && replay.potLabel.trim()) ||
    (typeof hand.potLabel === "string" && hand.potLabel.trim()) ||
    "";

  return {
    visibleBoard: board,
    potLabel,
    heroCards: extractHeroCards(hand),
  };
}

type PhrSpotFeedPreviewProps = {
  post: PublicHandPost;
  className?: string;
};

export function PhrSpotFeedPreview({ post, className = "" }: PhrSpotFeedPreviewProps) {
  const { visibleBoard, potLabel, heroCards } = getSpotPreviewFromPost(post);
  const boardToShow = visibleBoard.slice(0, 5);

  return (
    <div
      className={`relative aspect-[4/3] w-[7.5rem] shrink-0 overflow-hidden rounded-xl border border-emerald-500/25 bg-[radial-gradient(circle_at_50%_42%,rgba(61,110,52,0.92),rgba(28,52,26,0.98))] shadow-[inset_0_0_24px_rgba(0,0,0,0.35),0_8px_20px_rgba(0,0,0,0.25)] sm:w-[8.5rem] ${className}`}
      aria-hidden
    >
      <div className="absolute inset-[10%] rounded-[999px] border border-white/15" />

      {potLabel ? (
        <p className="absolute left-1/2 top-[18%] z-10 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold tabular-nums text-zinc-100 drop-shadow">
          Pot {potLabel}
        </p>
      ) : null}

      <div className="absolute left-1/2 top-[42%] z-10 flex -translate-x-1/2 items-center justify-center">
        {boardToShow.length > 0 ? (
          boardToShow.map((card, index) => (
            <span key={`${card}-${index}`} className={index > 0 ? "-ml-1.5" : ""}>
              <PhrPlayingCard card={card} size="xs" />
            </span>
          ))
        ) : (
          <div className="flex gap-0.5 opacity-40">
            {[0, 1, 2].map((i) => (
              <PhrCardBack key={`empty-${i}`} size="xs" />
            ))}
          </div>
        )}
      </div>

      {heroCards.length > 0 && (
        <div className="absolute bottom-[14%] left-1/2 z-10 flex -translate-x-1/2">
          {heroCards.map((card, index) => (
            <span
              key={`hero-${card}-${index}`}
              className={
                index === 0 ? "origin-bottom-right rotate-[-8deg]" : "-ml-3 origin-bottom-left rotate-[8deg]"
              }
            >
              <PhrPlayingCard card={card} size="xs" />
            </span>
          ))}
        </div>
      )}

      <p className="absolute bottom-1.5 left-0 right-0 text-center text-[8px] font-bold uppercase tracking-wider text-emerald-200/80">
        Spot
      </p>
    </div>
  );
}
