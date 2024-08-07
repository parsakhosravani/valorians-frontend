import { TextImage } from "@/components/molecules";
import iron from "~/images/resources/iron.webp";
import wood from "~/images/resources/wood.webp";
import clay from "~/images/resources/clay.webp";
import crop from "~/images/resources/crop.webp";
import time from "~/images/resources/time.webp";

import population from "~/images/resources/population.webp";

import { StaticImageData } from "next/image";
import { Chip, Row, Text } from "@/components/atoms";
import { TBuilding } from "@/components/templates";

interface BuildingProps {
  buidling: TBuilding;
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
    resource: crop,
    value: "-1 Per Hour",
  },
  {
    resource: population,
    value: "1",
  },
];

export const Building: React.FC<BuildingProps> = ({ buidling }) => {
  return (
    <div className="p-2 bg-buildingBg backdrop-blur-xs rounded-[4px] border border-[#374961] flex items-center">
      <div>
        <div className="-mt-1">
          <Chip color="primary" label="Level 1" />
        </div>
        <TextImage
          direction="row"
          imgSrc={buidling.src}
          imgAlt="building"
          size="large"
          gap={20}
        >
          <div>
            <Row className="justify-between">
              <h2 className="text-sm font-bold">{buidling.name}</h2>
              <TextImage imgSrc={time} imgAlt={"time cost"} title={"10s"} />
            </Row>
            <Text color="gray" size="tiny">
              upgrade cost:
            </Text>
            <div className="flex flex-wrap gap-2">
              {buildingCost.map((item, index) => (
                <div className="">
                  <TextImage
                    key={index}
                    imgSrc={item.resource}
                    imgAlt={item.value}
                    title={item.value}
                  />
                </div>
              ))}
            </div>
            <Text color="gray" size="tiny">
              your benefit:
            </Text>
            <TextImage
              imgSrc={population}
              imgAlt="populationPerHour"
              title="+2 growth per hour"
              size="small"
            />
          </div>
        </TextImage>
      </div>
    </div>
  );
};
