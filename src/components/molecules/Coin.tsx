interface CoinProps {
  coin: number;
}

export const Coin: React.FC<CoinProps> = ({ coin }) => {
  return (
    <div className="flex items-center bg-[#212F42] rounded p-1 gap-[2px] h-full">
      <div className="w-[16px] h-[16px] pt-[1px] rounded-full">
        <img src="./images/resources/coin.webp" alt="coin" />
      </div>
      <div className=" text-white text-[12px] font-bold ">{coin}</div>
    </div>
  );
};
