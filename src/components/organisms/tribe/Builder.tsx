import { Row } from "@/components/atoms";
import { TextImage } from "@/components/molecules";
import builder from "~/images/resources/builder.webp";
import { InfoDrawer } from "../InfoDrawer";

interface BuilderProps {}

export const Builder: React.FC<BuilderProps> = () => {
  return (
    <Row className="bg-[#212F42] justify-between mb-2 text-[#B5C7DE] p-1 rounded-sm flex-1 h-full">
      <TextImage
        imgSrc={builder}
        imgAlt=""
        title="1 Builders are available to upgrade buildings"
      />
      <InfoDrawer
        content={"You can upgrade at least 3 buildings at the same time"}
        title="Builders"
      />
    </Row>
  );
};
