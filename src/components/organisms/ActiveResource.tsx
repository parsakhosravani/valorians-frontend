"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Capacity, ProgressBar } from "../molecules";
import Image from "next/image";
import { TResource } from "@/context/ResourceContext";
import { useTelegramContext } from "@/store/telegram/hook";

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

  // useEffect(() => {
  //   const handleTouchStart = (e: any) => {
  //     if (activeResource.count < resourceCapacity) {
  //       onConsumeEnergy();
  //       const rect = e.currentTarget.getBoundingClientRect();
  //       for (let i = 0; i < e.touches.length; i++) {
  //         const touch = e.touches[i];
  //         const x = touch.clientX - rect.left;
  //         const y = touch.clientY - rect.top;
  //         setClickPositions((prev) => [...prev, { x, y }]);
  //         setTimeout(() => {
  //           setClickPositions((prev) => prev.slice(1));
  //         }, Infinity);
  //       }
  //     }
  //   };

  //   const touchArea = document.getElementById("touchArea");
  //   if (touchArea) {
  //     touchArea.addEventListener("touchstart", handleTouchStart, false);
  //   }

  //   return () => {
  //     if (touchArea) {
  //       touchArea.removeEventListener("touchstart", handleTouchStart, false);
  //     }
  //   };
  // }, [activeResource, onConsumeEnergy, resourceCapacity]);


  const { telegram } = useTelegramContext()

  const [touches, setTouches] = useState<any>([]);
  const [touchesNumber, setTouchesNumber] = useState<any>([]);
  // const [isTouched, setIsTouched] = useState(false);
  // const [isLastTouch, setIsLastTouch] = useState(false);

  const handleTouch = (event: any) => {
    telegram?.WebApp.HapticFeedback.impactOccurred("soft");


    const newTouches = Array.from(event.changedTouches).map(() => ({
      id: Math.random(),
    }));
    const newTouchesNumbers = Array.from(event.changedTouches).map((touch: any) => ({
      id: Math.random(),
      x: touch.clientX - 85,
      y: touch.clientY - 70,
    }));

    activeResource.count += newTouchesNumbers.length * mineLevel;
    onConsumeEnergy();

    setTouches((prevTouches: any) => [...prevTouches, ...newTouches]);
    setTouchesNumber((prevTouches: any) => [...prevTouches, ...newTouchesNumbers]);

    // Remove the touch element after the animation is done
    setTimeout(() => {
      setTouches((prevTouches: any) =>
        prevTouches.filter((t: any) => !newTouches.some((nt) => nt.id === t.id))
      );
    }, 20); // Match this duration with the animation duration
    setTimeout(() => {
      setTouchesNumber((prevTouches: any) =>
        prevTouches.filter(
          (t: any) => !newTouchesNumbers.some((nt) => nt.id === t.id)
        )
      );
    }, 300); // Match this duration with the animation duration
    // Match this duration with the animation duration
  };



  return (

    <>
      {touchesNumber.map((touch: any) => (
        <div
          key={touch.id}
          className={clsx(
            "touch-element z-[2] font-medium absolute  text-white animation-touch-coin",
            // resourceCapacity >= earn_per_tap || isLastTouch
            true
              ? "text-4xl"
              : "text-sm"
          )}
          style={{ left: `${touch.x}px`, top: `${touch.y}px` }}
        >
          {
            // resourceCapacity >= earn_per_tap || isLastTouch
            activeResource.count === resourceCapacity
              ? "NO CAPACITY!"
              : `+${mineLevel}`}
        </div>
      ))}

      <div className="flex w-full items-center flex-col relative">
        <Capacity
          size="large"
          value={activeResource.count}
          totalValue={resourceCapacity}
        />
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
        <div className="w-full h-full bg-red" onTouchEnd={handleTouch}>
          <div
            id="touchArea"
            className={"relative w-[260px] h-[260px] my-4 group mx-auto"}

          // onClick={(e) => {
          //   if (activeResource.count < resourceCapacity) {
          //     onConsumeEnergy();
          //     const rect = e.currentTarget.getBoundingClientRect();
          //     const x = e.clientX - rect.left - 50;
          //     const y = e.clientY - rect.top - 50;
          //     setClickPositions((prev) => [...prev, { x, y }]);
          //     //TODO: interval request needed!
          //     setTimeout(() => {
          //       setClickPositions((prev) => prev.slice(1));
          //     }, 50000);
          //   } else {
          //     activeResource.count = resourceCapacity;
          //   }
          // }}
          >
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
        </div>
        <div style={{ backgroundImage: `url(${activeResource.bg})` }}>
          <h1 className="text-[40px] font-bold">
            {activeResource?.name.toUpperCase()}
          </h1>
        </div>

      </div>
    </>
  );
};
