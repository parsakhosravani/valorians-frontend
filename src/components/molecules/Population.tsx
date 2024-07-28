import React, { FunctionComponent } from "react";
import population from "~/images/resources/population.png";
import populationPerHour from "~/images/resources/populationPerHour.png";
import { TextImage } from "./TextImage";

interface PopulationPropsType {}

export const Population: FunctionComponent<PopulationPropsType> = () => {
  return (
    <div className="bg-[#212F42] p-1 rounded-md flex-1 flex h-full">
      <div className="flex flex-col items-center w-1/2">
        <p className="text-[7px] text-[#9C9797]">tribe population</p>
        <TextImage
          size="small"
          imgSrc={population}
          imgAlt="population"
          title="100"
        />
      </div>
      <div className="w-[2px] h-full bg-[#191F27] flex-shrink-0 mr-2" />
      <div className="flex flex-col items-center w-1/2">
        <p className="text-[7px] text-[#9C9797]">population per hour</p>
        <TextImage
          size="small"
          imgSrc={populationPerHour}
          imgAlt="populationPerHour"
          title="+100"
        />
      </div>
    </div>
  );
};
