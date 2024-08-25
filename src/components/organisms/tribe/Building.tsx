import { TextImage } from "@/components/molecules";
import iron from "~/images/resources/iron.webp";
import wood from "~/images/resources/wood.webp";
import clay from "~/images/resources/clay.webp";
import crop from "~/images/resources/crop.webp";
import time from "~/images/resources/time.webp";
import buildingImg from "~/images/buildings/Resource Warehouse.webp";

import population from "~/images/resources/population.webp";

import { StaticImageData } from "next/image";
import { Button, Chip, Col, Row, Text } from "@/components";
import { TResource } from "@/context";
import useSWR from "swr";
import { fetcher, fetcherWithToken } from "@/app/api/fetcher";

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
  const handleUpgrade = () => {
    fetcherWithToken(
      `${process.env.NEXT_PUBLIC_BASE_URL}userAssets/upgrade/${building.id}`,
      { method: "PUT" }
    );
  };

  return (
    <Col className="bg-buildingBg backdrop-blur-xs rounded-[4px] border border-[#374961] p-2 items-center">
      <Col className="relative">
        <Row className="-top-2 left-0 absolute">
          <Chip color="primary" label={building.level.toString()} />
        </Row>
        <TextImage
          imgSrc={buildingImg}
          imgAlt="building"
          size="extraLarge"
          gap={20}
        >
          <Col className="justify-center gap-2">
            <h2 className="text-lg font-bold">{building.name}</h2>
            <Text color="gray" size="small">
              In publishing and graphic design, Lorem ipsum is a placeholder
              text commonly used to demonstrate the visual form of a document or
              a typeface without relying on
            </Text>
          </Col>
        </TextImage>
        <Col className="pt-2 space-y-1">
          <Text weight="bold">Your Current Level ({building.level})</Text>
          <Text color="gray">Impact on population growth</Text>
          <Text color="gray">Village population capacity</Text>
          <Text weight="bold">Next Level ({building.level + 1})</Text>
          <Text color="gray">Impact on population growth</Text>
          <Text color="gray">Village population capacity</Text>
          <Text weight="bold">The cost of upgrading from level 2 to 3</Text>
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
          <Row className="py-1">
            <TextImage
              imgSrc={time}
              imgAlt={"time cost"}
              title={`Upgrade time : ${building.upgradeTime} minute`}
              size="small"
            />
          </Row>
          <Button onClick={handleUpgrade}>Upgrade</Button>
        </Col>

        {/* <Col>
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
           
            </Col> */}
      </Col>
    </Col>
  );
};
