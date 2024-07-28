import React, { FunctionComponent } from "react";
import { Button } from "../atoms";

interface FriendsPropsType {}

export const Friends: FunctionComponent<FriendsPropsType> = () => {
  return (
    <div className="bg-friends bg-no-repeat bg-cover bg-center w-full h-full"></div>
  );
};
