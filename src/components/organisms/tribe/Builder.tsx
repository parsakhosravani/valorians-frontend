import builder from "~/images/resources/builder.webp";

import { InfoDrawer, Row, TextImage } from "@/components";
import { useGame } from "@/context";

export const Builder: React.FC = () => {
  const { state, rates } = useGame();
  const free = rates.builders - state.queue.length;

  return (
    <Row className="bg-[#212F42] justify-between mb-2 text-[#B5C7DE] p-1 rounded-sm">
      <TextImage
        imgAlt="builder"
        imgSrc={builder}
        title={`${free} of ${rates.builders} builder${rates.builders === 1 ? "" : "s"} available`}
      />
      <InfoDrawer
        content="Each builder upgrades one building at a time. Level up your Town Hall to get an extra builder at levels 5, 10 and 15, and to build faster."
        title="Builders"
      />
    </Row>
  );
};
