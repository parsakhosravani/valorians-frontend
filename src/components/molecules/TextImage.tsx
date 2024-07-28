import Image, { StaticImageData } from "next/image";

interface TextImageProps {
  imgSrc: StaticImageData;
  imgAlt: string;
  title: string;
  size?: "small" | "medium" | "large";
  direction?: "row" | "column";
}

export const TextImage: React.FC<TextImageProps> = ({
  imgSrc,
  title,
  imgAlt,
  size = "medium",
  direction = "row",
}) => {
  const sizeClasses = {
    small: "text-[10px]",
    medium: "text-sm",
    large: "text-xl ",
  };

  const imageSizes = {
    small: 12,
    medium: 18,
    large: 82,
  };

  const directionClass = direction === "column" ? "flex-col" : "flex-row";

  return (
    <div
      className={`flex font-bold gap-1 items-center justify-center ${sizeClasses[size]} ${directionClass}`}
    >
      <Image
        width={imageSizes[size]}
        height={imageSizes[size]}
        src={imgSrc}
        alt={imgAlt}
      />
      <p className="whitespace-nowrap">{title.toLocaleUpperCase()}</p>
    </div>
  );
};
