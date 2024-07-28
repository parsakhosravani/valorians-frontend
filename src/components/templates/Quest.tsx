import React, { FunctionComponent } from "react";

interface QuestPropsType {}

export const Quest: FunctionComponent<QuestPropsType> = () => {
  return (
    <div className="bg-quest -z-10 fixed top-0 bg-no-repeat bg-cover bg-center flex flex-col items-center justify-center w-full h-full gap-1"></div>
  );
};
