"use client";
import { useState } from "react";
import { EnergyIcon } from "../../atoms";
import { Capacity } from "../../molecules";

import { TResource } from "@/context/resource/ResourceContext";
import { SkillDrawer } from "./SkillDrawer";

interface SkillProps {
  availableEnergy: number;
  consumeEnergy: number;
  mineLevel: number;
  coin: number;
  setCoin: (value: number) => void;
  activeResource: TResource;
  setMineLevel: (value: number) => void;
  setAvailableEnergy: (value: number) => void;
}

export const Skill: React.FC<SkillProps> = ({
  availableEnergy,
  consumeEnergy,
  mineLevel,
  setMineLevel,
  setAvailableEnergy,
}) => {
  const [energyCapacity] = useState(15000);

  return (
    <div className="w-full flex justify-between px-2 my-4">
      <div className="flex items-center gap-2">
        <EnergyIcon />
        <Capacity
          value={availableEnergy - consumeEnergy}
          totalValue={energyCapacity}
        />
      </div>
      <SkillDrawer
        mineLevel={mineLevel}
        setMineLevel={setMineLevel}
        setAvailableEnergy={setAvailableEnergy}
      />
    </div>
  );
};
