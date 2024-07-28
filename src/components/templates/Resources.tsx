"use client";

import React, { useState } from "react";
import { ActiveResource, Skill } from "../organisms";
import { useResourceContext } from "../../context/ResourceContext";

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

  const [consumeEnergy, setConsumeEnergy] = useState(0);
  const [earnLevelEnergy, setEarnLevelEnergy] = useState(10);
  const [availableEnergy, setAvailableEnergy] = useState(12000);

  const onConsumeEnergyHandler = () => {
    if (consumeEnergy !== availableEnergy) {
      setConsumeEnergy(consumeEnergy + earnLevelEnergy);
      setActiveResource((prevActiveResource: { count: number }) => ({
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

  return (
    <div className="pt-2">
      <ActiveResource
        resourceCapacity={resourceCapacity}
        onConsumeEnergy={onConsumeEnergyHandler}
        activeResource={activeResource}
        mineLevel={earnLevelEnergy}
      />
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
  );
};
