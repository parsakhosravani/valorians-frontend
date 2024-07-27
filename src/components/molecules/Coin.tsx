import Image from "next/image";
import coin from "~/images/resources/coin.webp";

interface CoinProps {
  value: number;
}

export const Coin: React.FC<CoinProps> = ({ value }) => {
  return (
    <>
      <Image width={16} height={16} src={coin} alt="coin" />
      <div className=" text-white text-xs font-bold ">
        {value.toLocaleString("en-US")}
      </div>
    </>
  );
};
