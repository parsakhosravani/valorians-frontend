import React, { FunctionComponent } from "react";

interface TribePropsType {}

export const Tribe: FunctionComponent<TribePropsType> = () => {
  return (
    <div className="bg-tribe -z-10 fixed top-0 bg-no-repeat bg-cover bg-center flex flex-col items-center justify-center w-full h-full gap-1"></div>
  );
};
