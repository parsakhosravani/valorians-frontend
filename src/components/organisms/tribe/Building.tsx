import { TextImage } from "@/components/molecules";
import iron from "~/images/resources/iron.webp";
import wood from "~/images/resources/wood.webp";
import clay from "~/images/resources/clay.webp";
import crop from "~/images/resources/crop.webp";
import time from "~/images/resources/time.webp";
import population from "~/images/resources/population.webp";

import { StaticImageData } from "next/image";
import { Chip, Col, Row, Text } from "@/components";
import { TResource } from "@/context";

interface BuildingProps {
  building: TResource;
}

type TBuildingCost = {
  resource: StaticImageData;
  value: string;
};

const buildingCost: TBuildingCost[] = [
  { resource: wood, value: "100" },
  { resource: crop, value: "100" },
  { resource: iron, value: "100" },
  { resource: clay, value: "100" },
  { resource: crop, value: "-1 Per Hour" },
  { resource: population, value: "1" },
];

export const Building: React.FC<BuildingProps> = ({ building }) => {
  return (
    <Col className="bg-buildingBg backdrop-blur-xs rounded-[4px] border border-[#374961] p-2 items-center">
      <Row className="relative">
        <Row className="-top-2 left-0 absolute">
          <Chip color="primary" label="1" />
        </Row>

        <Col className="justify-center gap-2">
          <Row className="justify-between items-center">
            <h2 className="text-lg font-bold">{building.name}</h2>
            <TextImage
              imgSrc={time}
              imgAlt={"time cost"}
              title={building.upgradeTime + "s"}
              size="small"
            />
          </Row>
          <Col>
            <Text color="gray" size="tiny">
              Upgrade Expenses
            </Text>
            <Row className="justify-between">
              <TextImage
                imgSrc={population}
                imgAlt="populationPerHour"
                title="+2 growth per hour"
                size="small"
              />
            </Row>
          </Col>
          <Col>
            <Text color="gray" size="tiny">
              Upgrade Impact on Population Growth
            </Text>
            <Row className="flex-wrap gap-1">
              {buildingCost.map((item, index) => (
                <TextImage
                  key={index}
                  imgSrc={item.resource}
                  imgAlt={item.value}
                  title={item.value}
                  size="small"
                />
              ))}
            </Row>
          </Col>
        </Col>
      </Row>
    </Col>
  );
};
