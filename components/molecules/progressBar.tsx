interface ProgressBarProps {
  color: string;
  value: number;
  totalValue: number;
  size?: "small" | "medium" | "large";
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  color,
  value,
  totalValue,
  size = "medium",
}) => {
  const sizeClasses = {
    small: "h-1 w-[60px]",
    medium: "h-2 w-[290px]",
    large: "px-6 py-3 text-lg",
  };
  const percentage = Math.round((value * 100) / totalValue) + "%";
  return (
    <div className={`relative ${sizeClasses[size]}`}>
      <div className="h-full bg-white rounded-[10px] shadow-inner relative" />
      <div
        style={{
          width: percentage,
        }}
        className={`h-full rounded-[10px] top-0 absolute ${color}`}
      >
        <p className="text-[8px] -mb-2 text-center">
          {size == "medium" && percentage}
        </p>
      </div>
    </div>
  );
};
