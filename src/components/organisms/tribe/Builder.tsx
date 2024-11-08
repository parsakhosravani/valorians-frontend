import { InfoDrawer, Row, TextImage } from "@/components";
import builder from "~/images/resources/builder.webp";

interface BuilderProps {}

export const Builder: React.FC<BuilderProps> = () => {
  return (
    <Row className="bg-[#212F42] justify-between mb-2 text-[#B5C7DE] p-1 rounded-sm flex-1 h-full">
      <TextImage
        imgSrc={builder}
        imgAlt="builder"
        title="1 Builders are available to upgrade buildings"
      />
      <InfoDrawer
        content={"You can upgrade at least 3 buildings at the same time"}
        title="Builders"
      />
    </Row>
  );
};
