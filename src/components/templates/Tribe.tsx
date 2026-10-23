"use client";

import React, { FunctionComponent } from "react";
import Image from "next/image";

import bg from "~/images/background/tribe.webp";

import { Builder, Building, Col } from "@/components";
import { BUILDINGS } from "@/lib/game/config";
import { useGame } from "@/context";

export const Tribe: FunctionComponent = () => {
  const { state } = useGame();

  // Buildings under construction float to the top.
  const sorted = [...BUILDINGS].sort((a, b) => {
    const qa = state.queue.some((q) => q.building === a.id) ? 1 : 0;
    const qb = state.queue.some((q) => q.building === b.id) ? 1 : 0;

    return qb - qa;
  });

  return (
    <>
      <Col className="px-3 pt-1 w-full">
        <Builder />
        <div className="space-y-2.5 w-full pb-4">
          {sorted.map((item) => (
            <Building key={item.id} building={item} />
          ))}
        </div>
      </Col>

      <Image
        priority
        alt={"tribe"}
        className="fixed h-full top-0 left-0 w-full -z-10 object-cover opacity-25"
        src={bg}
      />
    </>
  );
};
