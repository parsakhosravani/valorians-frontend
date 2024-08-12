interface ProgressBarProps {
  value: number;
  totalValue: number;
  size?: "small" | "medium" | "large";
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  totalValue,
  size = "medium",
}) => {
  const sizeClasses = {
    small: "h-1 w-full",
    medium: "h-2 w-[290px]",
    large: "px-6 py-3 text-lg",
  };
  const percentage =
    value < totalValue ? Math.floor((value * 100) / totalValue) + "%" : "100%";
  return (
    <div className={`relative ${sizeClasses[size]}`}>
      <div className="h-full bg-white rounded-[10px] shadow-inner relative" />
      <div
        style={{
          width: percentage,
        }}
        className="h-full rounded-[10px] top-0 absolute bg-[#00A3FF] flex items-center justify-center"
      >
        <p className="text-[8px] font-bold text-center">
          {size == "medium" && percentage}
        </p>
      </div>
    </div>
  );
};
