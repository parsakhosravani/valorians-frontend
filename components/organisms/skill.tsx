"use client";
import { useState } from "react";
import { BoostIcon, Button, EarnIcon, EnergyIcon, MineIcon } from "../atoms";
import { Drawer } from "../molecules";
import { TResource } from "../templates";

interface SkillProps {
  availableEnergy: number;
  consumeEnergy: number;
  activeResource: TResource;
}

type TDrawerState = "mine" | "earn" | "boost";
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
  const handleDrawerOpen = (state: TDrawerState) => {
    setIsDrawerOpen(true);
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
          title={`Earn more ${activeResource.name}`}
          position="bottom"
        >
          <div className="text-sm py-4 space-y-2">
            <p className="text-[#A2B5BF]">
              As you level up, you will earn more iron per tap
            </p>
            <p>
              <b>Level 1:</b> Earn 1 per Tap (current Level)
            </p>
            <p>
              <b>Level 2:</b> Earn 2 per Tap (Next Level){" "}
            </p>
            <p className="flex items-center space-x-1">
              <b>Upgrade cost: </b>
              <img
                className="w-[16px] h-[16px]"
                src="./images/resources/coin.webp"
                alt="coin"
              />
              <b>100</b>
            </p>
          </div>
          <Button size="large" onClick={handleEnergyIncrease} isFull>
            Upgrade {activeResource.name}
          </Button>
        </Drawer>
        <div
          onClick={() => handleDrawerOpen("earn")}
          className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#0F1114]"
        >
          <EarnIcon />
        </div>
        <div
          onClick={() => handleDrawerOpen("mine")}
          className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#0F1114]"
        >
          <MineIcon />
        </div>
        <div
          onClick={() => handleDrawerOpen("boost")}
          className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#0F1114]"
        >
          <BoostIcon />
        </div>
      </div>
    </div>
  );
};
