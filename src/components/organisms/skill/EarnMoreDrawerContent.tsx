interface EarnDrawerContentProps {
  mineLevel: number;
}

export const EarnMoreDrawerContent: React.FC<EarnDrawerContentProps> = ({
  mineLevel,
}) => {
  return (
    <>
      <p className="text-[#A2B5BF]">
        As you level up, you will earn more iron per tap
      </p>
      <p>
        <b>Level 1:</b> Earn {mineLevel} per Tap (current Level)
      </p>
      <p>
        <b>Level 2:</b> Earn {mineLevel * 2} per Tap (next Level)
      </p>
      <p className="flex items-center space-x-1">
        <b>Upgrade cost: </b>
        <img
          className="w-[16px] h-[16px]"
          src="./images/resources/coin.webp"
          alt="coin"
        />
        <b>100</b>
      </p>
    </>
  );
};