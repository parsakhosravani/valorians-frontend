"use client";

import React, { useEffect, useState } from "react";
import { ActiveResource, Skill } from "../organisms";
import { useResourceContext } from "../../context/ResourceContext";
import Image from "next/image";
import { useTelegramContext } from "@/store/telegram/hook";

export const Resources = () => {
  const {
    resources,
    setResources,
    activeResource,
    setActiveResource,
    resourceCapacity,
    coin,
    setCoin,
  } = useResourceContext();
  const { telegram } = useTelegramContext()

  const [consumeEnergy, setConsumeEnergy] = useState(0);
  const [earnLevelEnergy, setEarnLevelEnergy] = useState(10);
  const [availableEnergy, setAvailableEnergy] = useState(12000);

  const onConsumeEnergyHandler = () => {
    if (consumeEnergy !== availableEnergy) {
      setConsumeEnergy(consumeEnergy + earnLevelEnergy);
      setActiveResource((prevActiveResource) => ({
        ...prevActiveResource,
        count: prevActiveResource.count + earnLevelEnergy,
      }));
      setResources(
        resources.map((res) =>
          res.id === activeResource.id
            ? { ...res, count: res.count + earnLevelEnergy }
            : res
        )
      );
    }
  };

  useEffect(() => {
    telegram?.WebApp.BackButton.hide();
  }, []);

  return (
    <>
      <div className="w-full flex flex-col items-stretch">
        <div className="pt-2">
          <ActiveResource
            resourceCapacity={resourceCapacity}
            onConsumeEnergy={onConsumeEnergyHandler}
            activeResource={activeResource}
            mineLevel={earnLevelEnergy}
          />
        </div>
        <Skill
          coin={coin}
          setCoin={setCoin}
          setMineLevel={setEarnLevelEnergy}
          mineLevel={earnLevelEnergy}
          availableEnergy={availableEnergy}
          setAvailableEnergy={setAvailableEnergy}
          consumeEnergy={consumeEnergy}
          activeResource={activeResource}
        />
      </div>

      <Image
        priority
        src={activeResource.bg}
        alt={activeResource.name}
        className="absolute h-full top-0 left-0 w-full -z-10 object-cover opacity-[0.15]"
      />
    </>
  );
};
