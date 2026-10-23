"use client";
import { useState } from "react";
import clsx from "clsx";
import Image from "next/image";

import { Col, Row, InfoDrawer, Capacity, ProgressBar } from "@/components";
import { useGame, useTelegramContext } from "@/context";

type FloatingNumber = { id: number; x: number; y: number; value: number };

let floatId = 0;

export const ActiveResource: React.FC = () => {
  const { telegram } = useTelegramContext();
  const { activeResource, state, rates, tap } = useGame();
  const [floats, setFloats] = useState<FloatingNumber[]>([]);

  const count = state.resources[activeResource.id];
  const isFull = count >= rates.capacity;
  const noEnergy = state.energy < rates.tapPower;

  // Pointer events fire once per finger, so multi-touch taps all count.
  const handleTap = (event: React.PointerEvent) => {
    const gained = tap(activeResource.id);

    if (!gained) {
      telegram?.WebApp.HapticFeedback.notificationOccurred("error");

      return;
    }
    telegram?.WebApp.HapticFeedback.impactOccurred("soft");

    const f = { id: ++floatId, x: event.clientX - 20, y: event.clientY - 50, value: gained };

    setFloats((prev) => [...prev, f]);
    setTimeout(() => setFloats((prev) => prev.filter((p) => p.id !== f.id)), 600);
  };

  return (
    <>
      {floats.map((f) => (
        <div
          key={f.id}
          className="pointer-events-none z-[2] font-medium fixed text-white text-4xl animate-mine-animation"
          style={{ left: `${f.x}px`, top: `${f.y}px` }}
        >
          +{f.value}
        </div>
      ))}

      <Col className=" items-center relative">
        <Row className="relative">
          <Capacity size="large" totalValue={rates.capacity} value={Math.floor(count)} />
          <Row className="absolute -right-5">
            <InfoDrawer
              content="There is a limit for each resource in the warehouse. To increase the capacity of the warehouse, level up your Resource Warehouse building."
              title="Warehouse capacity"
            />
          </Row>
        </Row>
        <ProgressBar size="medium" totalValue={rates.capacity} value={count} />
        {(isFull || noEnergy) && (
          <p className="border p-2 bg-[#191F27] rounded text-xs absolute top-[72px] z-[1] border-[#F72214]">
            {isFull ? `The ${activeResource.name} warehouse is full` : "Out of energy, wait for it to refill"}
          </p>
        )}
        <div className="w-full h-full touch-none" onPointerDown={handleTap}>
          <div id="touchArea" className="relative w-[260px] h-[260px] my-4 group mx-auto">
            <div
              className={clsx(
                "w-full h-full group-active:animate-touch-animation",
                (isFull || noEnergy) && "opacity-[.5] group-active:animate-none"
              )}
            >
              <Image draggable={false} alt={activeResource.name} src={activeResource.img} />
            </div>
          </div>
        </div>
        <h1 className="text-4xl font-bold">{activeResource.name.toUpperCase()}</h1>
      </Col>
    </>
  );
};
