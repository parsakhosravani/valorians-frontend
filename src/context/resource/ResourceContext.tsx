"use client";
import React, {
  createContext,
  useState,
  useContext,
  ReactNode,
  useEffect,
} from "react";
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
export type TResource = {
  id: number;
  name: string;
  level: number;
  value: number;
  type: "RESOURCE" | "BUILDING";
  quantity: number;
  quantityPerHour: number;
  activeQuantity: number;
  activeQuantityPerHour: number;
  upgradeTime: number | null;
  img: string;
  bg: string;
  color: string;
};

const initialResources = [
  {
    img: iron,
    bg: ironBg,
    name: "Iron",
  },
  {
    img: wood,
    bg: woodBg,
    name: "Wood",
  },
  {
    img: clay,
    bg: clayBg,
    name: "Clay",
  },
  {
    img: crop,
    bg: cropBg,
    name: "Crop",
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
  const [energyCapacity, setEnergyCapacity] = useState(0);
  const [availableEnergy, setAvailableEnergy] = useState(12000);
  const [mineLevel, setMineLevel] = useState(10);
  const [availableFullEnergy, setAvailableFullEnergy] = useState(3);
  const { data } = useSWR("/api/user-assets", fetcher);
  useEffect(() => {
    if (data) {
      const resourceImages = {
        Iron: { img: iron, bg: ironBg },
        Wood: { img: wood, bg: woodBg },
        Clay: { img: clay, bg: clayBg },
        Crop: { img: crop, bg: cropBg },
      };
      const energyResource = data.find((asset: TResource) => asset.id === 6);
      if (energyResource) {
        setEnergyCapacity(energyResource.value);
      }
      const updatedResources = data.map((asset: TResource) => ({
        ...asset,
        img: resourceImages[asset.name]?.img || "",
        bg: resourceImages[asset.name]?.bg || "",
      }));

      setResources(updatedResources);
    }
  }, [data]);

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
