"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useResourceContext } from "@/context";
import useBackButtonReset from "@/hooks/useBackButtonReset";
import { ActiveResource, Skill } from "../organisms";

export const Resources = () => {
  const {
    resources,
    setResources,
    activeResource,
    setActiveResource,
    coin,
    setCoin,
  } = useResourceContext();

  const [consumeEnergy, setConsumeEnergy] = useState(0);
  const [earnLevelEnergy, setEarnLevelEnergy] = useState(10);
  const [availableEnergy, setAvailableEnergy] = useState(12000);

  const onConsumeEnergyHandler = (value: any) => {
    if (consumeEnergy !== availableEnergy) {
      setConsumeEnergy(value);
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

  useBackButtonReset();

  return (
    <>
      <div className="w-full flex flex-col items-stretch">
        <div className="pt-2">
          <ActiveResource
            onConsumeEnergy={onConsumeEnergyHandler}
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
