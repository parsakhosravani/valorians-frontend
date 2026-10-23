import clsx from "clsx";

interface TextProps {
  children: React.ReactNode;
  size?: "tiny" | "small" | "medium" | "large";
  color?: "primary" | "gray" | "dark" | "white";
  weight?: "normal" | "bold" | "extrabold";
  className?: string;
}

export const Text: React.FC<TextProps> = ({
  children,
  size = "medium",
  color = "white",
  weight = "normal",
  className,
}) => {
  return (
    <span
      className={clsx(
        {
          "text-[10px]": size === "tiny",
          "text-xs": size === "small",
          "text-base": size === "medium",
          "text-lg": size === "large",
          "text-goldtext": color === "primary",
          "text-muted": color === "gray",
          "text-[#1E1610]": color === "dark",
          "text-parch": color === "white",
          "font-normal": weight === "normal",
          "font-bold": weight === "bold",
          "font-extrabold": weight === "extrabold",
        },
        className
      )}
    >
      {children}
    </span>
  );
};
