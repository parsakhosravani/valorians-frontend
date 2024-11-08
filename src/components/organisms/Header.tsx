"use client";

import React from "react";
import { Coin, Population, Resource, Row, User } from "@/components";
import { usePathname } from "next/navigation";
import { useResourceContext } from "@/context";

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
      <Row className="gap-1 h-[30px]">
        <User />
        <Population />
        <Row className="bg-[#212F42] rounded p-1 h-full">
          <Coin amount={coin} />
        </Row>
      </Row>

      {pathname === "/resources" && (
        <Row className="gap-2">
          {resources.map((item) => (
            <Resource
              key={item.id}
              resourceData={item}
              resourceCapacity={resourceCapacity}
              isActive={activeResource.id === item.id}
              onChangeResource={() => setActiveResource(item)}
            />
          ))}
        </Row>
      )}
      {pathname === "/tribe" && (
        <Row className="gap-2">
          {resources.map((item) => (
            <Resource
              key={item.id}
              resourceData={item}
              resourceCapacity={resourceCapacity}
            />
          ))}
        </Row>
      )}
    </header>
  );
};
