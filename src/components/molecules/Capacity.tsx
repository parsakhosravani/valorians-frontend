import clsx from "clsx";
import { Row } from "../atoms";

interface CapacityProps {
  value: number;
  totalValue: number;
  size?: "tiny" | "small" | "medium" | "large";
}

export const Capacity: React.FC<CapacityProps> = ({
  size = "medium",
  value,
  totalValue,
}) => {
  const fontSizeClasses = {
    tiny: "text-[10px]",
    small: "text-sm",
    medium: "text-lg",
    large: "text-[38px]",
  };

  return (
    <Row className={`flex gap-1 font-bold ${fontSizeClasses[size]}`}>
      <p className={clsx(value > totalValue && "text-[#F72214]")}>
        {value < totalValue
          ? value.toLocaleString("en-US")
          : totalValue.toLocaleString("en-US")}
      </p>
      /<p>{totalValue.toLocaleString("en-US")}</p>
    </Row>
  );
};
