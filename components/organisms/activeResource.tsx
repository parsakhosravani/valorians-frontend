"use client";
import { useEffect, useState } from "react";
import { earnLevelEnergy, resourceCapacity, TResource } from "../templates";
export const ActiveResource = ({
  activeResource,
  onConsumeEnergy,
}: {
  activeResource: TResource;
  onConsumeEnergy: () => void;
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
      } else {
        console.log("capacity needed");
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
    <div className="flex w-full items-center flex-col">
      <div className="flex gap-1 text-[38px]">
        <p>{activeResource.count}</p>
        <p>/</p>
        <p>{resourceCapacity}</p>
      </div>
      <div className="h-2 relative w-[290px]">
        <div className="h-full bg-white rounded-[10px] shadow-inner relative" />
        <div
          style={{
            width: (activeResource.count * 100) / resourceCapacity + "%",
          }}
          className={`h-full rounded-[10px] top-0 absolute ${activeResource?.color}`}
        />
      </div>
      <div
        id="touchArea"
        className={"relative w-[260px] h-[260px] my-4 group"}
        onClick={(e) => {
          if (activeResource.count < resourceCapacity) {
            onConsumeEnergy();
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            setClickPositions((prev) => [...prev, { x, y }]);
            setTimeout(() => {
              setClickPositions((prev) => prev.slice(1));
            }, 50000);
          } else {
            console.log("capacity needed");
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
            +{earnLevelEnergy}
          </span>
        ))}
        <div className="w-full h-full group-active:animate-[scale_0.3s_ease-in-out]">
          <img src={activeResource?.img} alt={activeResource.name} />
        </div>
      </div>
      <div>
        <h1 className="text-[46px]">{activeResource?.name}</h1>
      </div>
      <img
        src={activeResource?.bg}
        alt="bg"
        style={{ backgroundPosition: "center", backgroundSize: "100%" }}
        className="fixed left-0 right-0 top-0 bottom-0 -z-10 opacity-[0.2]"
      />
    </div>
  );
};
