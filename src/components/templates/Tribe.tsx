import React, { FunctionComponent } from "react";
import { Building } from "../organisms";
import mainBuilding from "~/images/building/mainBuilding.webp";
import barracksBuilding from "~/images/building/barracksBuilding.webp";
import resourcesBuilding from "~/images/building/resourcesBuilding.webp";
import bg from "~/images/background/tribe.webp";
import Image from "next/image";

interface TribePropsType { }

export const Tribe: FunctionComponent<TribePropsType> = () => {
  const buildings = [mainBuilding, barracksBuilding, resourcesBuilding];

  const getRandomBuilding = () => {
    return buildings[Math.floor(Math.random() * buildings.length)];
  };

  return (
    <>
    <div className="m-2 my-0 h-auto">
      <div className="grid grid-cols-2 gap-2.5 w-full overflow-y-auto scrollable max-h-[85svh] pb-10">
        {[...Array(20)].map((_, index) => (
          <div key={index}>
            <Building buidling={getRandomBuilding()} />
          </div>
        ))}
      </div>
    </div>

    <Image
        priority
        src={bg}
        alt={'intro'}
        className="absolute h-full top-0 left-0 w-full -z-10 object-cover"
      />
    </>
  );
};
