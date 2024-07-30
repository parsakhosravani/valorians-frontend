import React, { FunctionComponent } from "react";
import population from "~/images/resources/population.webp";
import populationPerHour from "~/images/resources/populationPerHour.webp";
import { TextImage } from "./TextImage";

interface PopulationPropsType {}

export const Population: FunctionComponent<PopulationPropsType> = () => {
  return (
    <div className="bg-[#212F42] p-1 rounded-md flex-1 flex h-full">
      <div className="flex flex-col justify-center items-center w-1/2">
        <TextImage
          size="small"
          imgSrc={population}
          imgAlt="population"
          title="100"
        />
      </div>
      <div className="flex flex-col justify-center items-center w-1/2">
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
