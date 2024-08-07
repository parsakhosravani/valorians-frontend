import { FunctionComponent } from "react";
import population from "~/images/resources/population.webp";
import { TextImage } from "./TextImage";
import { Col, Row, Text } from "../atoms";

interface PopulationPropsType {}

export const Population: FunctionComponent<PopulationPropsType> = () => {
  return (
    <Row className="bg-[#212F42]  rounded-md flex-1 h-full">
      <Col className="items-center w-1/2">
        <Text size="tiny" color="gray">
          population growth
        </Text>
        <TextImage
          size="small"
          imgSrc={population}
          imgAlt="population"
          title="100"
        />
      </Col>
      <Col className="items-center w-1/2 border-l-2 border-[#191F27]">
        <Text size="tiny" color="gray">
          population
        </Text>
        <TextImage
          size="small"
          imgSrc={population}
          imgAlt="populationPerHour"
          title="+100"
        />
      </Col>
    </Row>
  );
};
