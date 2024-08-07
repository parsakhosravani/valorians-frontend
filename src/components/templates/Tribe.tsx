import React, { FunctionComponent } from "react";
import { Builder, Building } from "../organisms";
import bg from "~/images/background/tribe.webp";
import Image, { StaticImageData } from "next/image";

export type TBuilding = {
  name: string;
  src: StaticImageData;
};
interface TribePropsType {
  buildings: TBuilding[];
}

export const Tribe: FunctionComponent<TribePropsType> = ({ buildings }) => {
  return (
    <>
      <div className="m-2 my-0 h-auto">
        <Builder />
        <div className="space-y-2 scrollable max-h-[80svh]">
          {buildings.map((item, index) => (
            <Building key={index} buidling={item} />
          ))}
        </div>
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
