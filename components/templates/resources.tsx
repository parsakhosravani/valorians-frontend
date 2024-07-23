"use client";

import React, { useState } from "react";
import { Coin, User } from "../molecules";
import { ActiveResource, Resource, Skill } from "../organisms";

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
export const earnLevelEnergy = 10;
export const resourceCapacity = 15000;

export type TResource = (typeof initialResources)[number];

export const Resources = () => {
  const [resources, setResources] = useState<TResource[]>(initialResources);
  const [activeResource, setActiveResource] = useState<TResource>(resources[0]);
  const [consumeEnergy, setConsumeEnergy] = useState(0);
  const [availableEnergy, setAvailableEnergy] = useState(12000);

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

  setTimeout(() => {
    resourceCapacity > availableEnergy &&
      setAvailableEnergy(availableEnergy + 1);
  }, 1000);

  return (
    <div className="p-2 flex flex-col h-full gap-2 relative">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <User />
          <Coin />
        </div>
        <div className="items-center gap-1 w-full flex">
          {resources.map((item) => (
            <Resource
              key={item.id}
              resourceData={item}
              isActive={activeResource.id === item.id}
              onChangeResource={onChangeResourceHandler}
            />
          ))}
        </div>
      </header>
      <div className="flex flex-col justify-center h-full">
        <ActiveResource
          onConsumeEnergy={onConsumeEnergyHandler}
          activeResource={activeResource}
        />
        <Skill
          availableEnergy={availableEnergy}
          consumeEnergy={consumeEnergy}
          activeResource={activeResource}
        />
      </div>
    </div>
  );
};
