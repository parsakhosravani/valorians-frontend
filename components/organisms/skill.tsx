"use client";
import { useState } from "react";
import {
  BoostIcon,
  Button,
  DatabaseIcon,
  EnergyIcon,
  MineIcon,
} from "../atoms";
import { Drawer } from "../molecules";
import { TResource } from "../templates";

interface SkillProps {
  availableEnergy: number;
  consumeEnergy: number;
  activeResource: TResource;
}

export const Skill: React.FC<SkillProps> = ({
  availableEnergy,
  consumeEnergy,
  activeResource,
}) => {
  const [energyCapacity, setEnergyCapacity] = useState(15000);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const handleEnergyIncrease = () => {
    setEnergyCapacity(energyCapacity + 500);
    console.log("energy capacity increased");
  };
  return (
    <div className="flex justify-between px-2">
      <div className="flex items-center gap-2">
        <EnergyIcon />
        <p className="text-[18px]">
          {availableEnergy - consumeEnergy} / {energyCapacity}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Drawer
          onClose={() => setIsDrawerOpen(false)}
          isOpen={isDrawerOpen}
          title={activeResource.name}
          position="bottom"
        >
          <div className="text-sm pb-6">
            As you level up, you will earn more iron per tap earum perspiciatis
            aliquam, voluptatem eligendi, asperiores et incidunt maxime delectus
            illum ipsam recusandae nobis suscipit quos consectetur reiciendis
            ipsum sunt natus.
          </div>
          <Button onClick={handleEnergyIncrease} isFull>
            Upgrade {activeResource.name}
          </Button>
        </Drawer>
        <div
          onClick={() => setIsDrawerOpen(true)}
          className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#0F1114]"
        >
          <DatabaseIcon />
        </div>
        <div className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#0F1114]">
          <MineIcon />
        </div>
        <div className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#0F1114]">
          <BoostIcon />
        </div>
      </div>
    </div>
  );
};
