"use client";
import React, { FunctionComponent } from "react";
import { BattleIcon } from "../atoms";

import bg from "~/images/background/battle.webp";
import Image from "next/image";
import useBackButton from "@/hooks/useBackButton";

interface BattlePropsType {}

export const Battle: FunctionComponent<BattlePropsType> = () => {
  useBackButton();
  return (
    <>
      <div className="flex flex-col items-center justify-center w-full h-full gap-1">
        <BattleIcon size={44} fill="white" />
        <h1 className="text-4xl font-extrabold">Great war is near.</h1>
        <h2 className="text-2xl font-extrabold"> Are You Ready ?</h2>
      </div>

      <Image
        priority
        src={bg}
        alt={"battle"}
        className="absolute h-full top-0 left-0 w-full -z-10 object-cover "
      />
    </>
  );
};
