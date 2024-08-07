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
          "text-primary-800": color === "primary",
          "text-[#BAB6B6]": color === "gray",
          "text-[#212F42]": color === "dark",
          "text-white": color === "white",
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
