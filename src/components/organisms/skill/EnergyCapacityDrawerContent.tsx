import { Text, Coin } from "@/components";
import { MAX_SKILL_LEVEL, energyCapacityForLevel, skillUpgradeCost } from "@/lib/game/config";

interface EnergyCapacityDrawerContentProps {
  level: number;
}

export const EnergyCapacityDrawerContent: React.FC<EnergyCapacityDrawerContentProps> = ({ level }) => {
  const maxed = level >= MAX_SKILL_LEVEL;
  const fmt = (n: number) => n.toLocaleString("en-US");

  return (
    <>
      <Text color="gray" size="small">
        More energy capacity lets you tap longer. Energy refills completely in one hour.
      </Text>
      <Text>
        <b>Level {level}:</b> Energy capacity {fmt(energyCapacityForLevel(level))} (current level)
      </Text>
      {maxed ? (
        <Text>Max level reached</Text>
      ) : (
        <>
          <Text>
            <b>Level {level + 1}:</b> Energy capacity {fmt(energyCapacityForLevel(level + 1))} (next level)
          </Text>
          <Text className="flex items-center space-x-1">
            <b>Upgrade cost: </b>
            <Coin amount={skillUpgradeCost(level)} />
          </Text>
        </>
      )}
    </>
  );
};
