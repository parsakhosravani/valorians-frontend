interface MineDrawerContentProps {
  mineLevel: number;
}

export const MineDrawerContent: React.FC<MineDrawerContentProps> = ({
  mineLevel,
}) => {
  return (
    <>
      <p className="text-[#A2B5BF]">
        As you level up, you will earn more iron per tap
      </p>
      <p>
        <b>Level 1:</b> Earn 1 per Tap ({mineLevel})
      </p>
      <p>
        <b>Level 2:</b> Earn 2 per Tap ({mineLevel * 2})
      </p>
      <p className="flex items-center space-x-1">
        <b>Upgrade cost: </b>
        <img
          className="w-[16px] h-[16px]"
          src="./images/resources/coin.webp"
          alt="coin"
        />
        <b>{100}</b>
      </p>
    </>
  );
};
