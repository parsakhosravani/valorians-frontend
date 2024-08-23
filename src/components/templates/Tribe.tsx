"use client";
import React, { FunctionComponent } from "react";
import { Building } from "../organisms";
import bg from "~/images/background/tribe.webp";
import Image from "next/image";
import useBackButton from "@/hooks/useBackButton";
import useSWR from "swr";
import { fetcher } from "@/app/api/fetcher";
import { TResource } from "@/context";

interface TribePropsType {}

export const Tribe: FunctionComponent<TribePropsType> = () => {
  const { data, error } = useSWR<TResource[]>("/api/user-assets", fetcher);

  useBackButton();

  const buildings = data?.filter((item) => item.type === "BUILDING") || [];
  if (error) return <div>Failed to load buildings</div>;
  if (!data) return <div>Loading...</div>;

  return (
    <>
      <div className="m-2 my-0 h-auto">
        <div className="grid grid-cols-2 gap-2.5 w-full overflow-y-auto scrollable max-h-[85svh] pb-10">
          {buildings.map((building) => (
            <div key={building.id}>
              <Building building={building} />
            </div>
          ))}
        </div>
      </div>

      <Image
        priority
        src={bg}
        alt={"intro"}
        className="absolute h-full top-0 left-0 w-full -z-10 object-cover"
      />
    </>
  );
};
