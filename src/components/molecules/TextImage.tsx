import Image, { StaticImageData } from "next/image";

interface TextImageProps {
  imgSrc: StaticImageData;
  imgAlt: string;
  title: string;
  size?: "small" | "medium" | "large";
}

export const TextImage: React.FC<TextImageProps> = ({
  imgSrc,
  title,
  imgAlt,
  size = "medium",
}) => {
  const sizeClasses = {
    small: "text-[10px] gap-1",
    medium: "text-sm gap-[2px]",
    large: "text-base gap-2",
  };

  const imageSizes = {
    small: 12,
    medium: 18,
    large: 24,
  };

  return (
    <div className={`flex items-center justify-center ${sizeClasses[size]}`}>
      <Image
        width={imageSizes[size]}
        height={imageSizes[size]}
        src={imgSrc}
        alt={imgAlt}
      />
      <p>{title.toLocaleUpperCase()}</p>
    </div>
  );
};
