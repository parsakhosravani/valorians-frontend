import { Text, Silver } from "@/components";

interface EnergyCapacityDrawerContentProps {
  energyCapacity: number;
}

export const EnergyCapacityDrawerContent: React.FC<
  EnergyCapacityDrawerContentProps
> = ({ energyCapacity }) => {
  return (
    <>
      <Text color="gray" size="small">
        As you level up, you will earn more iron per tap
      </Text>
      <Text>
        <b>Level 1:</b> Energy capacity {energyCapacity} (current Level)
      </Text>
      <Text>
        <b>Level 2:</b> Energy capacity {energyCapacity * 1.2} (next Level)
      </Text>
      <Text className="flex items-center space-x-1">
        <b>Upgrade cost: </b>
        <Silver amount={100} />
      </Text>
    </>
  );
};
