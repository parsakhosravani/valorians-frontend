"use client";
import { useState } from "react";
import clsx from "clsx";
import { Capacity, ProgressBar } from "../../molecules";
import Image from "next/image";
import { Col } from "@/components/atoms";
import { useResourceContext, useTelegramContext } from "@/context";

interface ActiveResource {
  onConsumeEnergy: any;
  mineLevel: number;
}

export const ActiveResource: React.FC<ActiveResource> = ({
  onConsumeEnergy,
  mineLevel,
}) => {
  const { telegram } = useTelegramContext();
  const [touches, setTouches] = useState<any>([]);
  const [touchesNumber, setTouchesNumber] = useState<any>([]);
  const { activeResource, resourceCapacity } = useResourceContext();

  const handleTouch = (event: any) => {
    telegram?.WebApp.HapticFeedback.impactOccurred("soft");

    const newTouches = Array.from(event.changedTouches).map(() => ({
      id: Math.random(),
    }));
    const newTouchesNumbers = Array.from(event.changedTouches).map(
      (touch: any) => ({
        id: Math.random(),
        x: touch.clientX - 85,
        y: touch.clientY - 70,
      })
    );
    activeResource.count < resourceCapacity &&
      onConsumeEnergy(
        (prev: any) => prev + newTouchesNumbers.length * mineLevel
      );
    setTouches((prevTouches: any) => [...prevTouches, ...newTouches]);
    setTouchesNumber((prevTouches: any) => [
      ...prevTouches,
      ...newTouchesNumbers,
    ]);

    //TIP: Remove the touch element after the animation is done
    setTimeout(() => {
      setTouches((prevTouches: any) =>
        prevTouches.filter((t: any) => !newTouches.some((nt) => nt.id === t.id))
      );
    }, 20);

    //TIP: Match this duration with the animation duration
    setTimeout(() => {
      setTouchesNumber((prevTouches: any) =>
        prevTouches.filter(
          (t: any) => !newTouchesNumbers.some((nt) => nt.id === t.id)
        )
      );
    }, 300);
  };

  return (
    <>
      {touchesNumber.map((touch: any) => (
        <div
          key={touch.id}
          className={clsx(
            "touch-element z-[2] font-medium absolute  text-white animation-touch-coin",
            true ? "text-4xl" : "text-sm"
          )}
          style={{ left: `${touch.x}px`, top: `${touch.y}px` }}
        >
          {activeResource.count < resourceCapacity && `+${mineLevel}`}
        </div>
      ))}

      <Col className=" items-center relative">
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

        {activeResource.count >= resourceCapacity && (
          <p className="border p-2 bg-[#191F27] rounded text-xs absolute top-[72px]  border-[#F72214]">
            The {activeResource.name} warehouse is full
          </p>
        )}
        <div className="w-full h-full bg-red" onTouchEnd={handleTouch}>
          <div
            id="touchArea"
            className={"relative w-[260px] h-[260px] my-4 group mx-auto"}
          >
            <div
              className={clsx(
                "w-full h-full group-active:animate-[scale_0.3s_ease-in-out]",
                activeResource.count > resourceCapacity &&
                  "opacity-[.5] group-active:animate-none"
              )}
            >
              <Image src={activeResource?.img} alt={activeResource.name} />
            </div>
          </div>
        </div>
        <div style={{ backgroundImage: `url(${activeResource.bg})` }}>
          <h1 className="text-4xl font-bold">
            {activeResource?.name.toUpperCase()}
          </h1>
        </div>
      </Col>
    </>
  );
};
