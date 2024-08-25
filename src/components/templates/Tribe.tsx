"use client";
import React, { FunctionComponent } from "react";
import { Builder, Building } from "../organisms";
import bg from "~/images/background/tribe.webp";
import Image from "next/image";
import useBackButton from "@/hooks/useBackButton";
import useSWR from "swr";
import { fetcher } from "@/app/api/fetcher";
import { TResource } from "@/context";
import { Col } from "../atoms";

interface TribePropsType {}

export const Tribe: FunctionComponent<TribePropsType> = () => {
  const { data, error } = useSWR<TResource[]>("/api/user-assets", fetcher);

  useBackButton();

  const buildings = data?.filter((item) => item.type === "BUILDING") || [];
  if (error) return <div>Failed to load buildings</div>;
  if (!data) return <div>Loading...</div>;

  return (
    <>
      <Col className="m-2 my-0">
        <Builder />
        <div className="gap-2.5 space-y-2 w-full overflow-y-auto scrollable max-h-[85svh] pb-32">
          {buildings.map((item) => (
            <Building key={item.id} building={item} />
          ))}
        </div>
      </Col>

      <Image
        priority
        src={bg}
        alt={"intro"}
        className="absolute h-full top-0 left-0 w-full -z-10 object-cover"
      />
    </>
  );
};
