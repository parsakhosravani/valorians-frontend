import { Coin } from "@/components/molecules";

interface EnergyCapacityDrawerContentProps {
  energyCapacity: number;
}

export const EnergyCapacityDrawerContent: React.FC<
  EnergyCapacityDrawerContentProps
> = ({ energyCapacity }) => {
  return (
    <>
      <p className="text-[#A2B5BF]">
        As you level up, you will earn more iron per tap
      </p>
      <p>
        <b>Level 1:</b> Energy capacity {energyCapacity} (current Level)
      </p>
      <p>
        <b>Level 2:</b> Energy capacity {energyCapacity * 1.2} (next Level)
      </p>
      <p className="flex items-center space-x-1">
        <b>Upgrade cost: </b>
        <Coin value={100} />
      </p>
    </>
  );
};
