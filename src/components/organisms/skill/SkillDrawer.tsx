"use client";
import { useState } from "react";
import { useGame } from "@/context";
import { MAX_SKILL_LEVEL, skillUpgradeCost } from "@/lib/game/config";
import { fullEnergyStatus } from "@/lib/game/engine";
import {
  Button,
  Col,
  Drawer,
  EarnMoreDrawerContent,
  EarnMoreIcon,
  EnergyCapacityDrawerContent,
  EnergyCapacityIcon,
  FullEnergyDrawerContent,
  FullEnergyIcon,
} from "@/components";

enum SkillDrawerType {
  FULL_ENERGY = "FULL_ENERGY",
  EARN_MORE = "EARN_MORE",
  ENERGY_CAPACITY = "ENERGY_CAPACITY",
}
export const SkillDrawer: React.FC = () => {
  const { activeResource, state, rates, now, upgradeSkill, refillEnergy } = useGame();
  const [openDrawer, setOpenDrawer] = useState<SkillDrawerType | null>(null);
  const [busy, setBusy] = useState(false);

  const fe = fullEnergyStatus(state, now);
  const skill = openDrawer === SkillDrawerType.EARN_MORE ? "tap" : "energy";
  const skillLevel = state.skills[skill];
  const skillMaxed = skillLevel >= MAX_SKILL_LEVEL;
  const notEnoughCoins = state.coins < skillUpgradeCost(skillLevel);
  const energyFull = state.energy >= rates.energyCapacity;

  const disabled =
    busy ||
    (openDrawer === SkillDrawerType.FULL_ENERGY ? !fe.ready || energyFull : skillMaxed || notEnoughCoins);

  const handleSkillUp = async () => {
    setBusy(true);
    const ok =
      openDrawer === SkillDrawerType.FULL_ENERGY ? await refillEnergy() : await upgradeSkill(skill);

    setBusy(false);
    if (ok && openDrawer === SkillDrawerType.FULL_ENERGY) setOpenDrawer(null);
  };
  const handleDrawerOpen = (type: SkillDrawerType) => {
    setOpenDrawer(type);
  };

  const buttonLabel =
    openDrawer === SkillDrawerType.FULL_ENERGY
      ? energyFull
        ? "Energy is full"
        : "Use For Free"
      : skillMaxed
      ? "Max level"
      : notEnoughCoins
      ? "Not enough coins"
      : "Upgrade";

  return (
    <div className="flex items-center gap-2">
      <Drawer
        onClose={() => setOpenDrawer(null)}
        isOpen={openDrawer !== null}
        title={
          openDrawer === SkillDrawerType.FULL_ENERGY
            ? "Full Energy"
            : openDrawer === SkillDrawerType.EARN_MORE
            ? "Earn More Per Tap"
            : openDrawer === SkillDrawerType.ENERGY_CAPACITY
            ? "Energy capacity"
            : ""
        }
        position="bottom"
      >
        <Col className="space-y-1 py-3">
          {openDrawer === SkillDrawerType.EARN_MORE && (
            <EarnMoreDrawerContent level={state.skills.tap} resourceName={activeResource.name} />
          )}
          {openDrawer === SkillDrawerType.ENERGY_CAPACITY && (
            <EnergyCapacityDrawerContent level={state.skills.energy} />
          )}
          {openDrawer === SkillDrawerType.FULL_ENERGY && (
            <FullEnergyDrawerContent remaining={fe.remaining} waitMs={fe.readyAt - now} />
          )}
        </Col>

        <Button isFull disabled={disabled} size="large" onClick={handleSkillUp}>
          {buttonLabel}
        </Button>
      </Drawer>
      <button
        aria-label="Full energy"
        onClick={() => handleDrawerOpen(SkillDrawerType.FULL_ENERGY)}
        className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#191F27]"
      >
        <FullEnergyIcon />
      </button>
      <button
        aria-label="Earn more"
        onClick={() => handleDrawerOpen(SkillDrawerType.EARN_MORE)}
        className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#191F27]"
      >
        <EarnMoreIcon />
      </button>
      <button
        aria-label="Energy capacity"
        onClick={() => handleDrawerOpen(SkillDrawerType.ENERGY_CAPACITY)}
        className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#191F27]"
      >
        <EnergyCapacityIcon />
      </button>
    </div>
  );
};
