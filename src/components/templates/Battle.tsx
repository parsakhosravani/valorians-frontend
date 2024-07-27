import React, { FunctionComponent } from "react";
import { BattleIcon } from "../atoms";

interface BattlePropsType {}

export const Battle: FunctionComponent<BattlePropsType> = () => {
  return (
    <div className="bg-battle bg-no-repeat bg-cover bg-center flex flex-col items-center justify-center w-full h-full gap-1">
      <BattleIcon size={44} fill="white" />
      <h1 className="text-4xl font-extrabold">Great war is near.</h1>
      <h2 className="text-2xl font-extrabold"> Are You Ready ?</h2>
    </div>
  );
};
