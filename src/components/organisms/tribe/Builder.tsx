import builder from "~/images/resources/builder.webp";

import { InfoDrawer } from "@/components/organisms/InfoDrawer";
import { Row } from "@/components/atoms/Row";
import { TextImage } from "@/components/molecules/TextImage";
import { useLive } from "@/context";

export const Builder: React.FC = () => {
  const builders = useLive((l) => l.rates.builders);
  const free = useLive((l) => l.rates.builders - l.state.queue.length);

  return (
    <Row className="bg-panel2 border border-dashed border-gold justify-between items-center text-parch font-bold px-3 py-2 rounded-xl">
      <TextImage
        imgAlt="builder"
        imgSrc={builder}
        title={`${free} of ${builders} builder${builders === 1 ? "" : "s"} available`}
      />
      <InfoDrawer
        content="Each builder upgrades one building at a time. Level up your Town Hall to get an extra builder at levels 5, 10 and 15, and to build faster."
        title="Builders"
      />
    </Row>
  );
};
