interface BoostDrawerContentProps {}

export const BoostDrawerContent: React.FC<BoostDrawerContentProps> = () => {
  return (
    <>
      <p className="text-[#A2B5BF]">
        You can use this feature for free once every 24 hours, with an interval
        of one hour each time, to recharge your energy
      </p>
      <p className="flex items-center space-x-1">3/3 available</p>
    </>
  );
};
