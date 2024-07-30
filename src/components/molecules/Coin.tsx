import Image from "next/image";
import coin from "~/images/resources/coin.webp";

interface CoinProps {
  amount: number;
}

export const Coin: React.FC<CoinProps> = ({ amount }) => {
  return (
    <div className="flex items-center gap-1">
      <Image className={"w-4 h-4"} src={coin} alt="coin" />
      <div className=" text-white text-xs font-bold ">
        {amount.toLocaleString("en-US")}
      </div>
    </div>
  );
};
