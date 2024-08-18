import { TextImage } from "@/components/molecules";
import iron from "~/images/resources/iron.webp";
import wood from "~/images/resources/wood.webp";
import clay from "~/images/resources/clay.webp";
import crop from "~/images/resources/crop.webp";
import time from "~/images/resources/time.webp";

import population from "~/images/resources/population.webp";

import { StaticImageData } from "next/image";
import { Chip, Col, Row, Text, TBuilding } from "@/components";

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
    <Col className="bg-buildingBg backdrop-blur-xs rounded-[4px] border border-[#374961] p-2 items-center">
      <Row className="relative">
        <Row className="-top-2 left-0 absolute">
          <Chip color="primary" label="1" />
        </Row>
        <TextImage
          direction="row"
          imgSrc={buidling.src}
          imgAlt="building"
          size="extraLarge"
          gap={20}
        >
          <Col className="justify-center gap-2">
            <Row className="justify-between items-center">
              <h2 className="text-lg font-bold">{buidling.name}</h2>
              <TextImage
                imgSrc={time}
                imgAlt={"time cost"}
                title={"10s"}
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
                upgrade Impact on population growth
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
        </TextImage>
      </Row>
    </Col>
  );
};
