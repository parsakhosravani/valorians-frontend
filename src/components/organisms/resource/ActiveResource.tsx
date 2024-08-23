"use client";
import { useState } from "react";
import clsx from "clsx";
import Image from "next/image";
import { Col, Row, InfoDrawer, Capacity, ProgressBar } from "@/components";
import { useResourceContext, useTelegramContext } from "@/context";

interface ActiveResource {}

export const ActiveResource: React.FC<ActiveResource> = () => {
  const { telegram } = useTelegramContext();
  const [touches, setTouches] = useState<any>([]);
  const [touchesNumber, setTouchesNumber] = useState<any>([]);
  const {
    activeResource,
    resourceCapacity,
    setAvailableEnergy,
    availableEnergy,
    mineLevel,
    energyCapacity,
    setActiveResource,
    setResources,
    resources,
  } = useResourceContext();
  const updateResourceQuantity = async (newQuantity: number) => {
    try {
      const response = await fetch(
        `http://localhost:3000/userAssets/updatesQuantity/${activeResource.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5OTJjMjQ2NS1jN2Y3LTQwMzgtYjU2Ni00ODc1MTRiYzJiMmYiLCJ1c2VybmFtZSI6IkVyZmFuIEFiYmFzaSAiLCJpYXQiOjE3MjQ0NDYwNTUsImV4cCI6MTcyNDQ1Njg1NX0.5yA9Njh6UmiUBr8LNRfZsOrj3GFNH9tvcrOlnELjOh4`,
          },
          body: JSON.stringify({ quantity: newQuantity }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update resource quantity");
      }

      // Handle successful update
      console.log("Resource quantity updated successfully");
    } catch (error) {
      console.error("Error updating resource quantity:", error);
    }
  };
  const onConsumeEnergy = () => {
    if (availableEnergy < energyCapacity) {
      const newQuantity = activeResource.quantity + mineLevel;
      setActiveResource((prevActiveResource) => ({
        ...prevActiveResource,
        quantity: newQuantity,
      }));
      setResources(
        resources.map((res) =>
          res.id === activeResource.id ? { ...res, quantity: newQuantity } : res
        )
      );
      updateResourceQuantity(newQuantity);
    }
  };
  const handleTouch = (event: any) => {
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
    if (
      activeResource.quantity < resourceCapacity &&
      availableEnergy >= mineLevel
    ) {
      telegram?.WebApp.HapticFeedback.impactOccurred("soft");
      onConsumeEnergy();
      setAvailableEnergy(availableEnergy - mineLevel);
    }

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
            "touch-element z-[2] font-medium absolute  text-white animate-mine-animation",
            true ? "text-4xl" : "text-sm"
          )}
          style={{ left: `${touch.x}px`, top: `${touch.y}px` }}
        >
          {activeResource.quantity < resourceCapacity &&
            availableEnergy > mineLevel &&
            `+${mineLevel}`}
        </div>
      ))}

      <Col className=" items-center relative">
        <Row className="relative">
          <Capacity
            size="large"
            value={activeResource.quantity}
            totalValue={resourceCapacity}
          />
          <Row className="absolute -right-5">
            <InfoDrawer
              content="There is a limit for each resource in the warehouse.to increase the capacity of the warehouse, level up your warehouse building"
              title="Warehouse capacity"
            />
          </Row>
        </Row>
        <ProgressBar
          size="medium"
          value={activeResource.quantity}
          totalValue={resourceCapacity}
        />
        {activeResource.quantity >= resourceCapacity && (
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
                "w-full h-full group-active:animate-touch-animation",
                activeResource.quantity >= resourceCapacity &&
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
