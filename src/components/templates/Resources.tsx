"use client";

import React, { useEffect } from "react";
import Image from "next/image";
import { useResourceContext } from "@/context";
import { ActiveResource, Col, Skill } from "@/components";
import useBackButtonReset from "@/hooks/useBackButtonReset";
import { fetcher } from "@/app/api/fetcher";

export const Resources = ({}: any) => {
  const { activeResource } = useResourceContext();

  return (
    <>
      <Col className="w-full">
        <Col>
          <ActiveResource />
        </Col>
        <Skill />
      </Col>

      <Image
        priority
        src={activeResource.bg}
        alt={activeResource.name}
        className="absolute h-full top-0 left-0 w-full -z-10 object-cover opacity-[0.15]"
      />
    </>
  );
};
