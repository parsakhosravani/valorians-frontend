import { Bar } from "@/components/atoms/Ui";

interface ProgressBarProps {
  value: number;
  totalValue: number;
  size?: "small" | "medium" | "large";
}

/** Kept for older call sites; draws the v2 bar. */
export const ProgressBar: React.FC<ProgressBarProps> = ({ value, totalValue, size = "medium" }) => (
  <Bar className={size === "small" ? "h-1.5" : "h-2.5"} max={totalValue} value={value} />
);
