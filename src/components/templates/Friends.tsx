"use client";
import React, { FunctionComponent, useEffect, useState } from "react";
import Image from "next/image";

import bg from "~/images/background/friends.webp";
import population from "~/images/resources/population.webp";
import avatar from "~/images/avatar.webp";
import viking from "~/images/friends/viking.png";

import { Coin, TextImage, InviteLink } from "@/components";
import useBackButton from "@/hooks/useBackButton";
import { useGame } from "@/context";
import { Friend, apiRequest } from "@/lib/api";
import { REFERRAL_REWARD } from "@/lib/game/config";

export const Friends: FunctionComponent = () => {
  useBackButton();
  const { authHeader, me } = useGame();
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
      <div className="relative flex flex-col w-full px-3 pt-8 pb-4">
        <div className="bg-buildingBg border border-line min-h-[100px] w-full flex justify-end rounded-2xl">
          <div className="w-2/6 flex flex-col justify-start relative">
            <Image
              alt="avatar"
              className="absolute max-w-[130px] max-h-[130px] w-[120%] h-[120%] bottom-0 object-left-bottom object-contain"
              src={viking}
            />
          </div>
          <div className="w-4/6 flex flex-col justify-between pl-3 py-2.5">
            <div className="text-left font-display text-parch text-lg font-bold">Invite Friends!</div>
            <div className="text-[#D8C9AE] text-xs font-normal">You and your friend will receive bonuses</div>
            <div className="flex items-center w-full gap-1">
              <Coin amount={REFERRAL_REWARD.coins} />
              <div className="text-center text-parch text-[9px] font-bold">For you and your friend</div>
            </div>
            <div className="flex items-center w-full gap-1">
              <Coin amount={REFERRAL_REWARD.premiumCoins} />
              <div className="text-[9px] font-bold">
                <span className="text-parch">If your friend has </span>
                <span className="text-[#E3A948]">Telegram Premium</span>
              </div>
            </div>
            <div className="flex items-center w-full gap-1">
              <TextImage
                direction="row"
                imgAlt="population"
                imgSrc={population}
                size="small"
                title={`+${REFERRAL_REWARD.population}`}
              />
              <div className="text-parch text-[9px] font-bold">population for you per friend</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col w-full items-start mt-4">
          <div className="font-display text-parch text-lg font-bold">
            Your Friends{data ? ` (${data.total})` : ""}:
          </div>
          {error && <p className="text-sm text-[#F08A6C]">{error}</p>}
          {!data && !error && <p className="text-sm text-[#B19C80]">Loading…</p>}
          {data && data.friends.length === 0 && (
            <p className="text-sm text-[#B19C80] mt-1">
              No friends yet. Share your invite link and you&apos;ll both get bonuses when they start playing.
            </p>
          )}
          <p className="text-xs text-[#B19C80] mt-1 mb-2">
            Friends count when they open the game through your link within 2 days of starting to play. Your code:{" "}
            <b className="text-goldtext">{me.referralCode}</b>
            {me.invitedBy && (
              <>
                {" "}· You joined through <b className="text-parch">{me.invitedBy}</b>&apos;s invite
              </>
            )}
          </p>
          <div className="grid grid-cols-2 gap-2.5 w-full pb-4">
            {data?.friends.map((f) => (
              <div
                key={f.id}
                className="w-full h-12 flex gap-2 items-center px-[6px] py-[5px] bg-buildingBg border border-line rounded-xl"
              >
                {f.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="avatar" className="h-[34px] w-[34px] rounded object-cover" src={f.photoUrl} />
                ) : (
                  <Image alt="avatar" height={34} src={avatar} width={34} />
                )}
                <div className="flex flex-col justify-start gap-[5px] min-w-0">
                  <div className="leading-none font-bold truncate">{f.name}</div>
                  <div className="flex gap-2">
                    <Coin amount={f.bonusCoins} />
                    <TextImage
                      direction="row"
                      imgAlt="population"
                      imgSrc={population}
                      size="small"
                      title={f.population.toLocaleString("en-US")}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <InviteLink className="sticky bottom-2 mt-2" />
      </div>

      <Image
        priority
        alt={"intro"}
        className="fixed h-full top-0 left-0 w-full -z-10 object-cover opacity-25"
        src={bg}
      />
    </>
  );
};
