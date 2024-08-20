"use client";
import React, { FunctionComponent, useEffect } from "react";
import bg from "~/images/background/friends.webp";
import population from "~/images/resources/population.webp";
import avatar from "~/images/avatar.webp";
import viking from "~/images/friends/viking.png";
import Image from "next/image";
import { Coin, TextImage, InviteLink } from "@/components";
import useBackButton from "@/hooks/useBackButton";
import { fetcher } from "@/app/api/fetcher";

const initialReferrals = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  img: "iron",
  name: "Parsa",
  tribe: 10 * (i + 1),
  population: 1000 * (i + 1),
}));

interface FriendsPropsType {}

export const Friends: FunctionComponent<FriendsPropsType> = () => {
  useEffect(() => {
    fetcher("/api/friends", {
      method: "GET",
    })
      .then(({ data }) => {
        console.log(data);
      })
      .catch((res: any) => {
        console.log(res);
      });
  }, []);
  useBackButton();
  return (
    <>
      <div className="relative flex flex-col justify-start max-w-[95%] m-auto w-full h-[100vh] mt-7">
        <div className="bg-buildingBg backdrop-blur-xs min-h-[100px] w-full flex justify-end rounded-[5px]">
          <div className="w-2/6 flex flex-col justify-start relative">
            <Image
              src={viking}
              alt="avatar"
              className="absolute max-w-[130px] max-h-[130px] w-[120%] h-[120%] bottom-0 object-left-bottom object-contain"
            />
          </div>
          <div className="w-4/6 flex flex-col justify-between pl-3 py-2.5">
            <div className="text-left text-white text-base font-bold">
              Invite Friends!
            </div>
            <div className="text-[#b0d7ec] text-xs font-normal">
              You and your friend will receive bonuses
            </div>
            <div className="flex items-center w-full gap-1">
              <Coin amount={100} />
              <div className="text-center text-white text-[9px] font-bold">
                For you and your friend
              </div>
            </div>
            <div className="flex items-center w-full gap-1">
              <Coin amount={100} />

              <div className="text-[9px] font-bold">
                <span className="text-white">For you and your friend </span>
                <span className="text-[#019af0]">(Telegram Premium)</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col w-full items-start mt-4">
          <div className="text-center text-white text-lg font-bold">
            Your Firends:
          </div>
          <div className="grid grid-cols-2 gap-2.5 w-full overflow-y-auto scrollable max-h-[50svh] pb-10">
            {[...Array(60)].map((_, index) => (
              <div className="w-full h-12 flex gap-2 items-center px-[6px] py-[5px] bg-buildingBg backdrop-blur-xs rounded-md">
                <Image src={avatar} width={34} height={34} alt="avatar" />
                <div className="flex flex-col justify-start gap-[5px]">
                  <div className="leading-none font-bold">Parsa</div>
                  <div className="flex gap-3">
                    <TextImage
                      direction="row"
                      imgSrc={population}
                      imgAlt="building"
                      title="+100"
                      size="small"
                    />
                    <TextImage
                      direction="row"
                      imgSrc={population}
                      imgAlt="population"
                      title="+100"
                      size="small"
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
        src={bg}
        alt={"intro"}
        className="absolute h-full top-0 left-0 w-full -z-10 object-cover"
      />
    </>
  );
};
