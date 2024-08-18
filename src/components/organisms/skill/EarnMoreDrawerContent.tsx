import { Text, Coin } from "@/components";

interface EarnDrawerContentProps {
  mineLevel: number;
}

export const EarnMoreDrawerContent: React.FC<EarnDrawerContentProps> = ({
  mineLevel,
}) => {
  return (
    <>
      <Text color="gray" size="small">
        As you level up, you will earn more iron per tap
      </Text>
      <Text>
        <b>Level 1:</b> Earn {mineLevel} per Tap (current Level)
      </Text>
      <Text>
        <b>Level 2:</b> Earn {mineLevel * 2} per Tap (next Level)
      </Text>
      <Text className="flex items-center space-x-1">
        <b>Upgrade cost: </b>
        <Coin amount={100} />
      </Text>
    </>
  );
};
