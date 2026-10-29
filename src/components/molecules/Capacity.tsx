import clsx from "clsx";
import { Row } from "@/components/atoms/Row";
import { grouped } from "@/lib/format";

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
      <p className={clsx(value >= totalValue && "text-bad")}>
        {grouped(value < totalValue ? value : totalValue)}
      </p>
      /<p>{grouped(totalValue)}</p>
    </Row>
  );
};
