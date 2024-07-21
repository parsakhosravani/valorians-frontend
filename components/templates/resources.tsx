"use client";

import React, { useState } from "react";
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
    count: 1000000,
  },
  {
    id: 2,
    img: "./images/resources/wood.webp",
    bg: "/images/background/woodbg.webp",
    color: "bg-orange-300",
    name: "Wood",
    count: 1000000,
  },
  {
    id: 3,
    img: "./images/resources/clay.webp",
    bg: "/images/background/claybg.webp",
    color: "bg-amber-700",
    name: "Clay",
    count: 1000000,
  },
  {
    id: 4,
    img: "./images/resources/crop.webp",
    bg: "/images/background/cropbg.webp",
    color: "bg-yellow-500",
    name: "Crop",
    count: 1000000,
  },
];

const skills = [
  {
    id: 1,
    icon: <DatabaseIcon />,
  },
  {
    id: 2,
    icon: <MineIcon />,
  },
  {
    id: 3,
    icon: <BoostIcon />,
  },
];
const energy = 4000;
export type TResource = (typeof initialResources)[number];

export const Resources = () => {
  const [resources, setResources] = useState<TResource[]>(initialResources);
  const [activeResource, setActiveResource] = useState<TResource>(resources[0]);
  const [consumeEnergy, setConsumeEnergy] = useState(0);

  const onChangeResourceHandler = (resource: TResource) => {
    setActiveResource(resource);
  };
  const updatedResources = resources.map((res) =>
    res.id === activeResource.id ? { ...res, count: res.count + 1 } : res
  );
  const onConsumeEnergyHandler = () => {
    if (consumeEnergy !== energy) {
      setConsumeEnergy(consumeEnergy + 1);
      setActiveResource((prevActiveResource) => ({
        ...prevActiveResource,
        count: prevActiveResource.count + 1,
      }));
      setResources(updatedResources);
    }
  };

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
          <p className="text-[18px]">{energy - consumeEnergy} / 4000</p>
        </div>
        <div className="flex items-center gap-2">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#0F1114]"
            >
              {skill.icon}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
