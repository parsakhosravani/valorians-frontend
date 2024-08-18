import React, { FunctionComponent } from "react";
import { Builder, Building, Col } from "@/components";
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
      <Col className="m-2 my-0">
        <Builder />
        <div className="gap-2.5 space-y-2 w-full overflow-y-auto scrollable max-h-[85svh] pb-32">
          {buildings.map((item, index) => (
            <Building key={index} buidling={item} />
          ))}
        </div>
      </Col>

      <Image
        priority
        src={bg}
        alt={"intro"}
        className="absolute h-full top-0 left-0 w-full -z-10 object-cover"
      />
    </>
  );
};
