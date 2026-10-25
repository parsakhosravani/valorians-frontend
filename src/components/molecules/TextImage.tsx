import Image, { StaticImageData } from "next/image";

type TextImagePropsBase = {
  imgSrc: StaticImageData;
  imgAlt: string;
  size?: "small" | "medium" | "large" | "extraLarge";
  direction?: "row" | "column";
  gap?: number | string;
};

type TextImageProps = TextImagePropsBase &
  (
    | { title: string; children?: never }
    | { title?: never; children: React.ReactNode }
  );

export const TextImage: React.FC<TextImageProps> = ({
  imgSrc,
  imgAlt,
  title,
  children,
  size = "medium",
  direction = "row",
  gap = 2,
}) => {
  const sizeClasses = {
    small: "text-[10px]",
    medium: "text-sm",
    large: "text-[14px]",
    extraLarge: "text-[14px]",
  };

  const imageSizes = {
    small: "h-[14px] w-[14px]",
    medium: "h-[18px] w-[18px]",
    large: "h-[54px] w-[54px]",
    extraLarge: "h-[120px] w-[120px]",
  };

  const directionClass = direction === "column" ? "flex-col" : "flex-row";

  return (
    <div
      className={`flex items-center justify-center ${sizeClasses[size]} ${directionClass}`}
      style={{ gap: typeof gap === "number" ? `${gap}px` : gap }}
    >
      <Image className={imageSizes[size]} src={imgSrc} alt={imgAlt} />
      {title ? <p className="whitespace-nowrap">{title}</p> : children}
    </div>
  );
};
