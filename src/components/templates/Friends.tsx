import React, { FunctionComponent } from "react";

interface FriendsPropsType {}

export const Friends: FunctionComponent<FriendsPropsType> = () => {
  return (
    <div className="bg-friends -z-10 fixed top-0 bg-no-repeat bg-cover bg-center flex flex-col items-center justify-center w-full h-full gap-1"></div>
  );
};
