import { Text } from "@/components";
import { FULL_ENERGY_PER_DAY } from "@/lib/game/config";
import { formatDuration } from "@/lib/format";

interface FullEnergyDrawerContentProps {
  remaining: number;
  waitMs: number;
}

export const FullEnergyDrawerContent: React.FC<FullEnergyDrawerContentProps> = ({ remaining, waitMs }) => {
  return (
    <>
      <Text color="gray" size="small">
        Refill your energy for free {FULL_ENERGY_PER_DAY} times a day, at most once per hour. Uses reset at
        midnight UTC.
      </Text>
      <Text size="large">
        {remaining}/{FULL_ENERGY_PER_DAY} available
      </Text>
      {remaining > 0 && waitMs > 0 && <Text color="gray">Ready again in {formatDuration(waitMs)}</Text>}
    </>
  );
};
