import { useGame } from "@/context";
import { EnergyIcon, Row, SkillDrawer, Capacity } from "@/components";

export const Skill: React.FC = () => {
  const { state, rates } = useGame();

  return (
    <Row className="justify-between px-2 my-4">
      <Row className="items-center gap-2">
        <EnergyIcon />
        <Capacity totalValue={rates.energyCapacity} value={Math.floor(state.energy)} />
      </Row>
      <SkillDrawer />
    </Row>
  );
};
