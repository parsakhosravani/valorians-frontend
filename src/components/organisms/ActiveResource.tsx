"use client";
import { useEffect, useState } from "react";
import { TResource } from "../templates";
import clsx from "clsx";
import { ProgressBar } from "../molecules";
import Image from "next/image";

interface ActiveResource {
  activeResource: TResource;
  onConsumeEnergy: () => void;
  mineLevel: number;
  resourceCapacity: number;
}

export const ActiveResource: React.FC<ActiveResource> = ({
  activeResource,
  onConsumeEnergy,
  resourceCapacity,
  mineLevel,
}) => {
  const [clickPositions, setClickPositions] = useState<
    { x: number; y: number }[]
  >([]);

  useEffect(() => {
    const handleTouchStart = (e: any) => {
      if (activeResource.count < resourceCapacity) {
        onConsumeEnergy();
        const rect = e.currentTarget.getBoundingClientRect();
        for (let i = 0; i < e.touches.length; i++) {
          const touch = e.touches[i];
          const x = touch.clientX - rect.left;
          const y = touch.clientY - rect.top;
          setClickPositions((prev) => [...prev, { x, y }]);
          setTimeout(() => {
            setClickPositions((prev) => prev.slice(1));
          }, Infinity);
        }
      }
    };

    const touchArea = document.getElementById("touchArea");
    if (touchArea) {
      touchArea.addEventListener("touchstart", handleTouchStart, false);
    }

    return () => {
      if (touchArea) {
        touchArea.removeEventListener("touchstart", handleTouchStart, false);
      }
    };
  }, [activeResource, onConsumeEnergy, resourceCapacity]);

  return (
    <div className="flex w-full items-center flex-col relative">
      <div className="flex gap-1 text-[38px] font-bold">
        <p
          className={clsx(
            activeResource.count === resourceCapacity && "text-[#F72214]"
          )}
        >
          {activeResource.count}
        </p>
        <p>/</p>
        <p>{resourceCapacity}</p>
      </div>
      <ProgressBar
        size="medium"
        value={activeResource.count}
        totalValue={resourceCapacity}
      />
      {activeResource.count === resourceCapacity && (
        <p className="border p-2 bg-[#191F27] rounded text-xs absolute top-[72px]  border-[#F72214]">
          The {activeResource.name} warehouse is full
        </p>
      )}
      <div
        id="touchArea"
        className={"relative w-[260px] h-[260px] my-4 group"}
        onClick={(e) => {
          if (activeResource.count < resourceCapacity) {
            onConsumeEnergy();
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left - 50;
            const y = e.clientY - rect.top - 50;
            setClickPositions((prev) => [...prev, { x, y }]);
            //TODO: interval request needed!
            setTimeout(() => {
              setClickPositions((prev) => prev.slice(1));
            }, 50000);
          } else {
            activeResource.count = resourceCapacity;
          }
        }}
      >
        {clickPositions.map((pos, index) => (
          <span
            key={index}
            style={{
              left: pos.x,
              top: pos.y,
              position: "absolute",
              animation: "fadeUpAndOut 1s forwards",
            }}
            className="font-bold text-3xl text-white select-none z-50"
          >
            +{Number(mineLevel)}
          </span>
        ))}
        <div
          className={clsx(
            "w-full h-full group-active:animate-[scale_0.3s_ease-in-out]",
            activeResource.count === resourceCapacity &&
              "opacity-[.5] group-active:animate-none"
          )}
        >
          <Image src={activeResource?.img} alt={activeResource.name} />
        </div>
      </div>
      <div style={{ backgroundImage: `url(${activeResource.bg})` }}>
        <h1 className="text-[40px] font-bold">
          {activeResource?.name.toUpperCase()}
        </h1>
      </div>
      <Image
        src={activeResource.bg}
        alt={activeResource.name}
        className="fixed h-screen top-0 w-full -z-10 opacity-[0.15]"
      />
    </div>
  );
};
