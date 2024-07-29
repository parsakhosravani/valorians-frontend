import React, { FunctionComponent } from "react";
import InviteLink from "../organisms/InviteLink";
import bg from "~/images/background/friends.webp";
import Image from "next/image";


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
    <>
      <div className="relative flex justify-center items-center max-w-[95%] m-auto bg-no-repeat bg-cover bg-center w-full h-full">

        <InviteLink className="absolute bottom-4 w-[98%]" />
      </div>

      <Image
        priority
        src={bg}
        alt={'intro'}
        className="absolute h-full top-0 left-0 w-full -z-10 object-cover opacity-[0.15]"
      />
    </>
  );
};
