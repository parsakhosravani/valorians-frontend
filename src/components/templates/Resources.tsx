"use client";

import React, { useState } from "react";
import { ActiveResource, Header, Skill } from "../organisms";

const initialResources = [
  {
    id: 1,
    img: "./images/resources/iron.webp",
    bg: "/images/background/iron.webp",
    color: "bg-zinc-600",
    name: "Iron",
    count: 10000,
  },
  {
    id: 2,
    img: "./images/resources/wood.webp",
    bg: "/images/background/wood.webp",
    color: "bg-orange-300",
    name: "Wood",
    count: 10000,
  },
  {
    id: 3,
    img: "./images/resources/clay.webp",
    bg: "/images/background/clay.webp",
    color: "bg-amber-700",
    name: "Clay",
    count: 10000,
  },
  {
    id: 4,
    img: "./images/resources/crop.webp",
    bg: "/images/background/crop.webp",
    color: "bg-yellow-500",
    name: "Crop",
    count: 10000,
  },
];
export type TResource = (typeof initialResources)[number];

export const Resources = () => {
  const [resources, setResources] = useState<TResource[]>(initialResources);
  const [resourceCapacity, setResourceCapacity] = useState(15000);
  const [activeResource, setActiveResource] = useState<TResource>(resources[0]);
  const [consumeEnergy, setConsumeEnergy] = useState(0);
  const [earnLevelEnergy, setEarnLevelEnergy] = useState(10);
  const [availableEnergy, setAvailableEnergy] = useState(12000);
  const [coin, setCoin] = useState(1000);

  const onChangeResourceHandler = (resource: TResource) => {
    setActiveResource(resource);
  };
  const updatedResources = resources.map((res) =>
    res.id === activeResource.id
      ? { ...res, count: res.count + earnLevelEnergy }
      : res
  );
  const onConsumeEnergyHandler = () => {
    if (consumeEnergy !== availableEnergy) {
      setConsumeEnergy(consumeEnergy + earnLevelEnergy);
      setActiveResource((prevActiveResource) => ({
        ...prevActiveResource,
        count: prevActiveResource.count + earnLevelEnergy,
      }));
      setResources(updatedResources);
    }
  };

  return (
    <>
      <Header
        resourceCapacity={resourceCapacity}
        coin={coin}
        resources={resources}
        onChangeResource={onChangeResourceHandler}
        activeResourceId={activeResource.id}
      />
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
    </>
  );
};