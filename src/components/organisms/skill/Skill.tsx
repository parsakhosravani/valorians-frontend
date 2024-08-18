import { useResourceContext } from "@/context";
import { EnergyIcon, Row, SkillDrawer, Capacity } from "@/components";

interface SkillProps {}

export const Skill: React.FC<SkillProps> = () => {
  const { energyCapacity, availableEnergy, mineLevel, setMineLevel } =
    useResourceContext();
  return (
    <Row className="justify-between px-2 my-4">
      <Row className="items-center gap-2">
        <EnergyIcon />
        <Capacity value={availableEnergy} totalValue={energyCapacity} />
      </Row>
      <SkillDrawer mineLevel={mineLevel} setMineLevel={setMineLevel} />
    </Row>
  );
};
