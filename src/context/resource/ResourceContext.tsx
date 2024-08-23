"use client";
import React, { createContext, useState, useContext, ReactNode } from "react";
import iron from "~/images/resources/iron.webp";
import wood from "~/images/resources/wood.webp";
import clay from "~/images/resources/clay.webp";
import crop from "~/images/resources/crop.webp";
import ironBg from "~/images/background/iron.webp";
import woodBg from "~/images/background/wood.webp";
import clayBg from "~/images/background/clay.webp";
import cropBg from "~/images/background/crop.webp";
import useSWR from "swr";
import { fetcher } from "@/app/api/fetcher";
export type TResource = (typeof initialResources)[number];

const initialResources = [
  {
    id: 1,
    img: iron,
    bg: ironBg,
    color: "bg-zinc-600",
    name: "Iron",
    count: 10000,
  },
  {
    id: 2,
    img: wood,
    bg: woodBg,
    color: "bg-orange-300",
    name: "Wood",
    count: 10000,
  },
  {
    id: 3,
    img: clay,
    bg: clayBg,
    color: "bg-amber-700",
    name: "Clay",
    count: 10000,
  },
  {
    id: 4,
    img: crop,
    bg: cropBg,
    color: "bg-yellow-500",
    name: "Crop",
    count: 10000,
  },
];

interface ResourceContextType {
  resources: TResource[];
  setResources: React.Dispatch<React.SetStateAction<TResource[]>>;
  activeResource: TResource;
  setActiveResource: React.Dispatch<React.SetStateAction<TResource>>;
  resourceCapacity: number;
  setResourceCapacity: React.Dispatch<React.SetStateAction<number>>;
  energyCapacity: number;
  setEnergyCapacity: React.Dispatch<React.SetStateAction<number>>;
  availableEnergy: number;
  setAvailableEnergy: React.Dispatch<React.SetStateAction<number>>;
  availableFullEnergy: number;
  setAvailableFullEnergy: React.Dispatch<React.SetStateAction<number>>;
  coin: number;
  setCoin: React.Dispatch<React.SetStateAction<number>>;
  mineLevel: number;
  setMineLevel: React.Dispatch<React.SetStateAction<number>>;
}

const ResourceContext = createContext<ResourceContextType | undefined>(
  undefined
);

export const ResourceProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [resources, setResources] = useState<TResource[]>(initialResources);
  const [activeResource, setActiveResource] = useState<TResource>(resources[0]);
  const [resourceCapacity, setResourceCapacity] = useState(15000);
  const [coin, setCoin] = useState(1000);
  const [energyCapacity, setEnergyCapacity] = useState(15000);
  const [availableEnergy, setAvailableEnergy] = useState(12000);
  const [mineLevel, setMineLevel] = useState(10);
  const [availableFullEnergy, setAvailableFullEnergy] = useState(3);
  const { data } = useSWR("/api/user-assets", fetcher);
  return (
    <ResourceContext.Provider
      value={{
        resources,
        setResources,
        activeResource,
        setActiveResource,
        resourceCapacity,
        setResourceCapacity,
        energyCapacity,
        setEnergyCapacity,
        availableEnergy,
        setAvailableEnergy,
        availableFullEnergy,
        setAvailableFullEnergy,
        mineLevel,
        setMineLevel,
        coin,
        setCoin,
      }}
    >
      {children}
    </ResourceContext.Provider>
  );
};

export const useResourceContext = () => {
  const context = useContext(ResourceContext);
  if (context === undefined) {
    throw new Error(
      "useResourceContext must be used within a ResourceProvider"
    );
  }
  return context;
};
