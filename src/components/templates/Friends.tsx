"use client";
import React, { FunctionComponent, useEffect, useState } from "react";

import { InviteLink } from "@/components/organisms/InviteLink";
import { Amount, Avatar, Backdrop, Card, Empty, SectionTitle, Spinner } from "@/components/ui";
import { GameIcon, TroopArt } from "@/art";
import useBackButton from "@/hooks/useBackButton";
import { useGame } from "@/context";
import { Friend, apiRequest } from "@/lib/api";
import { REFERRAL_REWARD } from "@/lib/game/config";

export const Friends: FunctionComponent = () => {
  useBackButton();
  const { authHeader } = useGame();
  const [data, setData] = useState<{ total: number; friends: Friend[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authHeader) return;
    apiRequest<{ total: number; friends: Friend[] }>(authHeader, "friends")
      .then(setData)
      .catch((e) => setError(e.message));
  }, [authHeader]);

  return (
    <>
      <div className="relative flex flex-col gap-4 w-full px-3 pt-2 pb-4">
        {/* Hero */}
        <Card className="relative overflow-hidden flex gap-2 pl-0 pb-0" tone="gold">
          <div className="relative w-[120px] shrink-0 -mb-1">
            <TroopArt className="absolute bottom-0 left-0 w-[130px] h-[130px]" id="spearman" />
          </div>
          <div className="flex flex-col gap-2 py-1 pb-3 min-w-0">
            <h1 className="font-display font-extrabold text-display-lg leading-none">Raise your clan</h1>
            <p className="text-small text-parch-300">Every friend who joins brings gifts for both of you.</p>
            <ul className="flex flex-col gap-1 text-small font-bold">
              <li className="flex items-center gap-1.5">
                <Amount icon="coin" value={REFERRAL_REWARD.coins} /> <span className="text-parch-500">each</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Amount icon="coin" value={REFERRAL_REWARD.premiumCoins} /> <span className="text-parch-500">if they have Premium</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Amount icon="population" value={`+${REFERRAL_REWARD.population}`} /> <span className="text-parch-500">people per friend</span>
              </li>
            </ul>
          </div>
        </Card>

        <div className="flex flex-col gap-2">
          <SectionTitle>Your clan{data ? ` · ${data.total}` : ""}</SectionTitle>
          {error && <p className="text-small text-blood-400">{error}</p>}
          {!data && !error && <Spinner />}
          {data && data.friends.length === 0 && (
            <Empty art={<GameIcon id="population" size={44} />} title="No friends yet">
              Share your invite link. You both get rewards when they start playing.
            </Empty>
          )}
          <div className="grid grid-cols-2 gap-2">
            {data?.friends.map((f) => (
              <Card key={f.id} className="flex gap-2 items-center !p-2">
                <Avatar seed={f.id} size={38} src={f.photoUrl} />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="font-bold truncate leading-tight">{f.name}</div>
                  <div className="flex gap-2">
                    <Amount icon="coin" size="xs" value={f.bonusCoins} />
                    <Amount icon="population" size="xs" value={f.population} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <InviteLink className="sticky bottom-2" />
      </div>
      <Backdrop scene="feast" />
    </>
  );
};
