"use client";

import React, { useEffect, useState } from "react";
import { BoostIcon, DatabaseIcon, EnergyIcon, MineIcon } from "../atoms";
import { Coin, Resource, User } from "../molecules";
import { ActiveResource } from "../organisms";

const initialResources = [
  {
    id: 1,
    img: "./images/resources/iron.webp",
    bg: "/images/background/stoneBg.webp",
    color: "bg-zinc-600",
    name: "Iron",
    count: 10000,
  },
  {
    id: 2,
    img: "./images/resources/wood.webp",
    bg: "/images/background/woodbg.webp",
    color: "bg-orange-300",
    name: "Wood",
    count: 10000,
  },
  {
    id: 3,
    img: "./images/resources/clay.webp",
    bg: "/images/background/claybg.webp",
    color: "bg-amber-700",
    name: "Clay",
    count: 10000,
  },
  {
    id: 4,
    img: "./images/resources/crop.webp",
    bg: "/images/background/cropbg.webp",
    color: "bg-yellow-500",
    name: "Crop",
    count: 10000,
  },
];
const earnLevelEnergy = 10;
export const resourceCapacity = 15000;

export type TResource = (typeof initialResources)[number];

export const Resources = () => {
  const [resources, setResources] = useState<TResource[]>(initialResources);
  const [activeResource, setActiveResource] = useState<TResource>(resources[0]);
  const [consumeEnergy, setConsumeEnergy] = useState(0);
  const [energyCapacity, setEnergyCapacity] = useState(150000);
  const [availableEnergy, setAvailableEnergy] = useState(10000);

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
    setAvailableEnergy(availableEnergy + 1);
  }, 1000);
  return (
    <div className="p-2 flex flex-col h-full gap-10 relative">
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
      <ActiveResource
        onConsumeEnergy={onConsumeEnergyHandler}
        activeResource={activeResource}
      />
      <div className="flex justify-between px-2">
        <div className="flex items-center gap-2">
          <EnergyIcon />
          <p className="text-[18px]">
            {availableEnergy - consumeEnergy} / {energyCapacity}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            onClick={() => setEnergyCapacity(energyCapacity + 500)}
            className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#0F1114]"
          >
            <DatabaseIcon />
          </div>
          <div className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#0F1114]">
            <MineIcon />
          </div>
          <div className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#0F1114]">
            <BoostIcon />
          </div>
        </div>
      </div>
    </div>
  );
};
