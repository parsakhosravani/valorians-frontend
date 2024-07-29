import React, { FunctionComponent } from "react";
import InviteLink from "../organisms/InviteLink";
import { Header } from "../organisms";

const initialReferrals = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  img: "iron",
  name: "Parsa",
  tribe: 10 * (i + 1),
  population: 1000 * (i + 1),
}));

interface FriendsPropsType { }

export const Friends: FunctionComponent<FriendsPropsType> = () => {
  return (
    <div className="relative flex justify-center items-center max-w-[95%] m-auto bg-friends bg-no-repeat bg-cover bg-center w-full h-full">
      
      <InviteLink className="absolute bottom-4 w-[98%]" />
    </div>
  );
};
