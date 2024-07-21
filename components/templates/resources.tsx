"use client";

import { useState } from "react";
import { Coin, Resource, User } from "../molecules";
import { Action } from "../organisms";
const resources = [
  {
    id: 1,
    img: "./images/resources/iron.webp",
    bg: "/images/background/stoneBg.webp",
    color: "bg-zinc-600",
    name: "Iron",
  },
  {
    id: 2,
    img: "./images/resources/wood.webp",
    bg: "/images/background/woodbg.webp",
    color: "bg-orange-300",
    name: "Wood",
  },
  {
    id: 3,
    img: "./images/resources/clay.webp",
    bg: "/images/background/claybg.webp",
    color: "bg-amber-700",
    name: "Clay",
  },
  {
    id: 4,
    img: "./images/resources/crop.webp",
    bg: "/images/background/cropbg.webp",
    color: "bg-yellow-500",
    name: "Crop",
  },
];
export type TResource = (typeof resources)[number];

export const Resources = () => {
  const [activeResource, setActiveResource] = useState<TResource>(resources[0]);

  const onChangeResourceHandler = (resource: TResource) => {
    setActiveResource(resource);
  };
  return (
    <div className="p-2 flex flex-col h-full gap-10 relative">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <User />
          <Coin />
        </div>

        <div className="items-center gap-1 w-full flex">
          {resources.map((item, index) => (
            <Resource
              key={index}
              resourceData={item}
              isActive={activeResource.id === item.id}
              onChangeResource={onChangeResourceHandler}
            />
          ))}
        </div>
      </header>
      <Action activeResource={activeResource} />
    </div>
  );
};
