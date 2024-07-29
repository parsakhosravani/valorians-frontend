import { TextImage } from "@/components/molecules";

import iron from "~/images/resources/iron.webp";
import wood from "~/images/resources/wood.webp";
import clay from "~/images/resources/clay.webp";
import crop from "~/images/resources/crop.webp";
import time from "~/images/resources/time.webp";

import population from "~/images/resources/population.webp";
import populationPerHour from "~/images/resources/populationPerHour.webp";

import { StaticImageData } from "next/image";
import { Chip } from "@/components/atoms";

interface BuildingProps {
  buidling: StaticImageData;
}
type TBuildingCost = {
  resource: StaticImageData;
  value: string;
};
const buildingCost: TBuildingCost[] = [
  {
    resource: wood,
    value: "100",
  },
  {
    resource: crop,
    value: "100",
  },
  {
    resource: iron,
    value: "100",
  },
  {
    resource: clay,
    value: "100",
  },
  {
    resource: time,
    value: "10s",
  },
  {
    resource: population,
    value: "1",
  },
];

export const Building: React.FC<BuildingProps> = ({ buidling }) => {
  return (
    <div className="p-2 bg-buildingBg backdrop-blur-xs rounded-[4px] border border-[#374961] flex flex-col items-center space-y-5">
      <div className="flex justify-between w-full">
        <Chip label="Level 1" />
        <TextImage
          imgSrc={populationPerHour}
          imgAlt="populationPerHour"
          title="+2"
        />
      </div>
      <TextImage
        direction="column"
        imgSrc={buidling}
        imgAlt="building"
        title="Main Building"
        size="large"
      />
      <div className="flex flex-wrap justify-center">
        {buildingCost.map((item, index) => (
          <div key={index} className="w-1/3">
            <TextImage
              imgSrc={item.resource}
              imgAlt="building"
              title={item.value}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
