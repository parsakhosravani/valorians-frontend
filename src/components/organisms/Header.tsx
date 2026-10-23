"use client";

import React from "react";
import { usePathname } from "next/navigation";

import { Coin, Population, Resource, Row, User } from "@/components";
import { RESOURCES, useGame } from "@/context";

export const Header: React.FC = () => {
  const { state, rates, activeResource, setActiveResource } = useGame();
  const pathname = usePathname();
  const showResources = pathname === "/resources" || pathname === "/tribe";

  return (
    <header className="w-full flex gap-2 flex-col p-2">
      <Row className="gap-1 h-[30px]">
        <User />
        <Population />
        <Row className="bg-[#212F42] rounded p-1 h-full">
          <Coin amount={Math.floor(state.coins)} />
        </Row>
      </Row>

      {showResources && (
        <Row className="gap-2">
          {RESOURCES.map((item) => (
            <Resource
              key={item.id}
              count={state.resources[item.id]}
              isActive={pathname === "/resources" && activeResource.id === item.id}
              perHour={rates.productionPerHour[item.id]}
              resourceCapacity={rates.capacity}
              resourceData={item}
              onChangeResource={pathname === "/resources" ? () => setActiveResource(item) : undefined}
            />
          ))}
        </Row>
      )}
    </header>
  );
};
