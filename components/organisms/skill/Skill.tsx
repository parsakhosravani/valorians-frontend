"use client";
import { useState } from "react";
import { BoostIcon, Button, EarnIcon, EnergyIcon, MineIcon } from "../../atoms";
import { Drawer } from "../../molecules";
import { TResource } from "../../templates";

import { FullEnergyDrawerContent } from "./FullEnergyDrawerContent";
import { EnergyCpacityDrawerContent } from "./EnergyCpacityDrawerContent";
import { EarnMoreDrawerContent } from "./EarnMoreDrawerContent";

interface SkillProps {
  availableEnergy: number;
  consumeEnergy: number;
  mineLevel: number;
  coin: number;
  setCoin: (value: number) => void;
  activeResource: TResource;
  setMineLevel: (value: number) => void;
}

enum DrawerType {
  FULL_ENERGY = "FULL_ENERGY",
  EARN_MORE = "EARN_MORE",
  ENERGY_CAPACITY = "ENERGY_CAPACITY",
}
export const Skill: React.FC<SkillProps> = ({
  availableEnergy,
  consumeEnergy,
  activeResource,
  mineLevel,
  coin,
  setCoin,
  setMineLevel,
}) => {
  const [energyCapacity, setEnergyCapacity] = useState(15000);
  const [openDrawer, setOpenDrawer] = useState<DrawerType | null>(null);

  const handleSkillUp = () => {
    if (openDrawer === DrawerType.ENERGY_CAPACITY) {
      if (coin >= 100) {
        setMineLevel(Math.round(mineLevel * 1.2));
        setCoin(coin - 100);
      }
    }
  };
  const handleDrawerOpen = (type: DrawerType) => {
    setOpenDrawer(type);
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
          onClose={() => setOpenDrawer(null)}
          isOpen={openDrawer !== null}
          title={
            openDrawer === DrawerType.FULL_ENERGY
              ? "Full Energy"
              : openDrawer === DrawerType.EARN_MORE
              ? `Earn More ${activeResource.name}`
              : openDrawer === DrawerType.ENERGY_CAPACITY
              ? "Energy capacity"
              : ""
          }
          position="bottom"
        >
          <div className="text-sm h-40 py-4 space-y-2">
            {openDrawer === DrawerType.EARN_MORE && <EarnMoreDrawerContent />}
            {openDrawer === DrawerType.ENERGY_CAPACITY && (
              <EnergyCpacityDrawerContent mineLevel={mineLevel} />
            )}
            {openDrawer === DrawerType.FULL_ENERGY && (
              <FullEnergyDrawerContent />
            )}
          </div>

          <Button size="large" onClick={handleSkillUp} isFull>
            {openDrawer === DrawerType.FULL_ENERGY
              ? "Use For Free"
              : openDrawer === DrawerType.EARN_MORE
              ? `Upgrade ${activeResource.name}`
              : "Upgrade"}
          </Button>
        </Drawer>

        <div
          onClick={() => handleDrawerOpen(DrawerType.EARN_MORE)}
          className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#0F1114]"
        >
          <MineIcon />
        </div>
        <div
          onClick={() => handleDrawerOpen(DrawerType.ENERGY_CAPACITY)}
          className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#0F1114]"
        >
          <BoostIcon />
        </div>
        <div
          onClick={() => handleDrawerOpen(DrawerType.FULL_ENERGY)}
          className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#0F1114]"
        >
          <EarnIcon />
        </div>
      </div>
    </div>
  );
};
