import clsx from "clsx";

interface CapacityProps {
  value: number;
  totalValue: number;
  size?: "small" | "medium" | "large";
}

export const Capacity: React.FC<CapacityProps> = ({
  size = "medium",
  value,
  totalValue,
}) => {
  const fontSizeClasses = {
    small: "text-sm",
    medium: "text-lg",
    large: "text-[38px]",
  };

  return (
    <div className={`flex gap-1 font-bold ${fontSizeClasses[size]}`}>
      <p className={clsx(value === totalValue && "text-[#F72214]")}>
        {value.toLocaleString("en-US")}
      </p>
      /<p>{totalValue.toLocaleString("en-US")}</p>
    </div>
  );
};
