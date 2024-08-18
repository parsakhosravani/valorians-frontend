import { Text } from "@/components";

interface FullEnergyDrawerContentProps {
  availableFullEnergy: number;
}

export const FullEnergyDrawerContent: React.FC<
  FullEnergyDrawerContentProps
> = ({ availableFullEnergy }) => {
  return (
    <>
      <Text color="gray" size="small">
        You can use this feature for free once every 24 hours, with an interval
        of one hour each time, to recharge your energy
      </Text>
      <Text size="large">{availableFullEnergy}/3 available</Text>
    </>
  );
};
