"use client";

import type { ReactNode } from "react";

import type { PublicHandPost } from "@/lib/phr-public-feed";

import { PhrSpotReviewBottomBar } from "./phr-spot-review-bottom-bar";

type PhrSpotReviewShellProps = {
  post: PublicHandPost;
  onBack: () => void;
  children: ReactNode;
};

export function PhrSpotReviewShell({ post, onBack, children }: PhrSpotReviewShellProps) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
      <div className="relative min-h-0 flex-1 p-2 sm:p-3">{children}</div>
      <PhrSpotReviewBottomBar post={post} onBack={onBack} />
    </div>
  );
}
