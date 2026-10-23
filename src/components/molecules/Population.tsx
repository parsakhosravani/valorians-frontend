import { FunctionComponent } from "react";

import population from "~/images/resources/population.webp";

import { Col, Row, Text, TextImage } from "@/components";
import { useGame } from "@/context";

interface PopulationPropsType {}

export const Population: FunctionComponent<PopulationPropsType> = () => {
  const { state, rates } = useGame();

  return (
    <Row className="bg-[#212F42]  rounded flex-1 h-full">
      <Col className="items-center w-1/2">
        <Text color="gray" size="tiny">
          population
        </Text>
        <TextImage
          imgAlt="population"
          imgSrc={population}
          size="small"
          title={Math.floor(state.population).toLocaleString("en-US")}
        />
      </Col>
      <Col className="items-center w-1/2 border-l-2 border-[#191F27]">
        <Text color="gray" size="tiny">
          growth per hour
        </Text>
        <TextImage
          imgAlt="populationPerHour"
          imgSrc={population}
          size="small"
          title={`+${Math.round(rates.growthPerHour).toLocaleString("en-US")}`}
        />
      </Col>
    </Row>
  );
};
