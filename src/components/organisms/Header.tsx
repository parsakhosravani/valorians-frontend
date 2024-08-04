"use client";

import React from "react";
import { Coin, Population, User } from "../molecules";
import { Resource } from "./resource/Resource";
import { useResourceContext } from "../../context/resource/ResourceContext";
import { usePathname } from "next/navigation";

export const Header: React.FC = () => {
  const {
    resources,
    activeResource,
    resourceCapacity,
    coin,
    setActiveResource,
  } = useResourceContext();
  const pathname = usePathname();
  return (
    <header className="w-full flex gap-2 flex-col p-2">
      <div className="flex items-center gap-2 h-[30px]">
        <User />
        <Population />
        <div className="flex items-center bg-[#212F42] rounded p-1 gap-[2px] h-full">
          <Coin amount={coin} />
        </div>
      </div>

      {pathname === "/resources" && (
        <div className="items-center justify-between w-full gap-2 flex pb-2">
          {resources.map((item) => (
            <Resource
              key={item.id}
              resourceData={item}
              resourceCapacity={resourceCapacity}
              isActive={activeResource.id === item.id}
              onChangeResource={() => setActiveResource(item)}
            />
          ))}
        </div>
      )}
    </header>
  );
};
