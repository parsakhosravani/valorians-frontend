import Image from "next/image";
import silver from "~/images/resources/silver.webp";
import { Row } from "../atoms";

interface SilverProps {
  amount: number;
}

export const Silver: React.FC<SilverProps> = ({ amount }) => {
  return (
    <Row className="items-center gap-1">
      <Image className={"w-4 h-4"} src={silver} alt="silver" />
      <div className=" text-white text-xs font-bold ">
        {amount?.toLocaleString("en-US")}
      </div>
    </Row>
  );
};
