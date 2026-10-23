import { Text, Coin } from "@/components";
import { MAX_SKILL_LEVEL, skillUpgradeCost, tapPowerForLevel } from "@/lib/game/config";

interface EarnDrawerContentProps {
  level: number;
  resourceName: string;
}

export const EarnMoreDrawerContent: React.FC<EarnDrawerContentProps> = ({ level, resourceName }) => {
  const maxed = level >= MAX_SKILL_LEVEL;

  return (
    <>
      <Text color="gray" size="small">
        As you level up, you earn more {resourceName.toLowerCase()} and every other resource per tap. Each tap
        uses as much energy as it earns.
      </Text>
      <Text>
        <b>Level {level}:</b> Earn {tapPowerForLevel(level)} per tap (current level)
      </Text>
      {maxed ? (
        <Text>Max level reached</Text>
      ) : (
        <>
          <Text>
            <b>Level {level + 1}:</b> Earn {tapPowerForLevel(level + 1)} per tap (next level)
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
