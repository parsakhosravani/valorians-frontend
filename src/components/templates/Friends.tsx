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
      <div className="relative flex flex-col justify-start max-w-[95%] m-auto w-full h-[100vh] mt-7">
        <div className="bg-buildingBg backdrop-blur-xs min-h-[100px] w-full flex justify-end rounded-[5px]">
          <div className="w-2/6 flex flex-col justify-start relative">
            <Image
              alt="avatar"
              className="absolute max-w-[130px] max-h-[130px] w-[120%] h-[120%] bottom-0 object-left-bottom object-contain"
              src={viking}
            />
          </div>
          <div className="w-4/6 flex flex-col justify-between pl-3 py-2.5">
            <div className="text-left text-white text-base font-bold">Invite Friends!</div>
            <div className="text-[#b0d7ec] text-xs font-normal">You and your friend will receive bonuses</div>
            <div className="flex items-center w-full gap-1">
              <Coin amount={REFERRAL_REWARD.coins} />
              <div className="text-center text-white text-[9px] font-bold">For you and your friend</div>
            </div>
            <div className="flex items-center w-full gap-1">
              <Coin amount={REFERRAL_REWARD.premiumCoins} />
              <div className="text-[9px] font-bold">
                <span className="text-white">If your friend has </span>
                <span className="text-[#019af0]">Telegram Premium</span>
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
              <div className="text-white text-[9px] font-bold">population for you per friend</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col w-full items-start mt-4">
          <div className="text-center text-white text-lg font-bold">
            Your Friends{data ? ` (${data.total})` : ""}:
          </div>
          {error && <p className="text-sm text-[#F72214]">{error}</p>}
          {!data && !error && <p className="text-sm text-[#B5C7DE]">Loading…</p>}
          {data && data.friends.length === 0 && (
            <p className="text-sm text-[#B5C7DE] mt-1">
              No friends yet. Share your invite link and you&apos;ll both get bonuses when they start playing.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2.5 w-full overflow-y-auto scrollable max-h-[45svh] pb-10">
            {data?.friends.map((f) => (
              <div
                key={f.id}
                className="w-full h-12 flex gap-2 items-center px-[6px] py-[5px] bg-buildingBg backdrop-blur-xs rounded-md"
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

        <InviteLink className="absolute bottom-[150px] w-[98%]" />
      </div>

      <Image
        priority
        alt={"intro"}
        className="absolute h-full top-0 left-0 w-full -z-10 object-cover"
        src={bg}
      />
    </>
  );
};
