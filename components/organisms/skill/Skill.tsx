"use client";
import { useState } from "react";
import { BoostIcon, Button, EarnIcon, EnergyIcon, MineIcon } from "../../atoms";
import { Drawer } from "../../molecules";
import { TResource } from "../../templates";
import { EarnDrawerContent } from "./EarnDrawerContent";
import { MineDrawerContent } from "./MineDrawerContent";
import { BoostDrawerContent } from "./BoostDrawerContent";

interface SkillProps {
  availableEnergy: number;
  consumeEnergy: number;
  activeResource: TResource;
}

enum DrawerType {
  EARN = "earn",
  MINE = "mine",
  BOOST = "boost",
}
export const Skill: React.FC<SkillProps> = ({
  availableEnergy,
  consumeEnergy,
  activeResource,
}) => {
  const [energyCapacity, setEnergyCapacity] = useState(15000);
  const [openDrawer, setOpenDrawer] = useState<DrawerType | null>(null);

  const handleEnergyIncrease = () => {
    setEnergyCapacity(energyCapacity + 500);
    console.log("energy capacity increased");
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
          title={`${
            openDrawer
              ? openDrawer.charAt(0).toUpperCase() + openDrawer.slice(1)
              : ""
          } ${activeResource.name}`}
          position="bottom"
        >
          {openDrawer === DrawerType.EARN && <EarnDrawerContent />}
          {openDrawer === DrawerType.MINE && <MineDrawerContent />}
          {openDrawer === DrawerType.BOOST && <BoostDrawerContent />}
          <Button size="large" onClick={handleEnergyIncrease} isFull>
            Upgrade {activeResource.name}
          </Button>
        </Drawer>

        <div
          onClick={() => handleDrawerOpen(DrawerType.EARN)}
          className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#0F1114]"
        >
          <EarnIcon />
        </div>
        <div
          onClick={() => handleDrawerOpen(DrawerType.MINE)}
          className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#0F1114]"
        >
          <MineIcon />
        </div>
        <div
          onClick={() => handleDrawerOpen(DrawerType.BOOST)}
          className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#0F1114]"
        >
          <BoostIcon />
        </div>
      </div>
    </div>
  );
};
