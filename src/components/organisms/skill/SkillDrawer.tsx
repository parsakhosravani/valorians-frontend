"use client";
import { useState } from "react";
import {
  Button,
  EarnMoreIcon,
  FullEnergyIcon,
  EnergyCapacityIcon,
} from "../../atoms";
import { Drawer } from "../../molecules";

import { FullEnergyDrawerContent } from "./FullEnergyDrawerContent";
import { EnergyCapacityDrawerContent } from "./EnergyCapacityDrawerContent";
import { EarnMoreDrawerContent } from "./EarnMoreDrawerContent";
import { useResourceContext } from "@/context/resource/ResourceContext";

interface SkillDrawerProps {
  mineLevel: number;
  setMineLevel: (value: number) => void;
  setAvailableEnergy: (value: number) => void;
}

enum SkillDrawerType {
  FULL_ENERGY = "FULL_ENERGY",
  EARN_MORE = "EARN_MORE",
  ENERGY_CAPACITY = "ENERGY_CAPACITY",
}
export const SkillDrawer: React.FC<SkillDrawerProps> = ({
  mineLevel,
  setMineLevel,
  setAvailableEnergy,
}) => {
  const { activeResource, coin, setCoin } = useResourceContext();

  const [energyCapacity, setEnergyCapacity] = useState(15000);
  const [openDrawer, setOpenDrawer] = useState<SkillDrawerType | null>(null);

  const handleSkillUp = () => {
    if (openDrawer === SkillDrawerType.EARN_MORE) {
      if (coin >= 100) {
        setMineLevel(Math.round(mineLevel * 1.2));
        setCoin(coin - 100);
      }
    }
    if (openDrawer === SkillDrawerType.FULL_ENERGY) {
      setAvailableEnergy(energyCapacity);
    }
    if (openDrawer === SkillDrawerType.ENERGY_CAPACITY) {
      setEnergyCapacity(energyCapacity + 500);
      if (coin >= 100) {
        setCoin(coin - 100);
      }
    }
  };
  const handleDrawerOpen = (type: SkillDrawerType) => {
    setOpenDrawer(type);
  };

  return (
    <div className="flex items-center gap-2">
      <Drawer
        onClose={() => setOpenDrawer(null)}
        isOpen={openDrawer !== null}
        title={
          openDrawer === SkillDrawerType.FULL_ENERGY
            ? "Full Energy"
            : openDrawer === SkillDrawerType.EARN_MORE
            ? `Earn More ${activeResource.name}`
            : openDrawer === SkillDrawerType.ENERGY_CAPACITY
            ? "Energy capacity"
            : ""
        }
        position="bottom"
      >
        <div className="text-sm h-40 py-4 space-y-2">
          {openDrawer === SkillDrawerType.EARN_MORE && (
            <EarnMoreDrawerContent mineLevel={mineLevel} />
          )}
          {openDrawer === SkillDrawerType.ENERGY_CAPACITY && (
            <EnergyCapacityDrawerContent energyCapacity={energyCapacity} />
          )}
          {openDrawer === SkillDrawerType.FULL_ENERGY && (
            <FullEnergyDrawerContent />
          )}
        </div>

        <Button size="large" onClick={handleSkillUp} isFull>
          {openDrawer === SkillDrawerType.FULL_ENERGY
            ? "Use For Free"
            : openDrawer === SkillDrawerType.EARN_MORE
            ? `Upgrade ${activeResource.name}`
            : "Upgrade"}
        </Button>
      </Drawer>
      <div
        onClick={() => handleDrawerOpen(SkillDrawerType.FULL_ENERGY)}
        className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#191F27]"
      >
        <FullEnergyIcon />
      </div>
      <div
        onClick={() => handleDrawerOpen(SkillDrawerType.EARN_MORE)}
        className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#191F27]"
      >
        <EarnMoreIcon />
      </div>
      <div
        onClick={() => handleDrawerOpen(SkillDrawerType.ENERGY_CAPACITY)}
        className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#191F27]"
      >
        <EnergyCapacityIcon />
      </div>
    </div>
  );
};