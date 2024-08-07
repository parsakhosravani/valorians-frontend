import React, { FunctionComponent } from "react";
import { BattleIcon, Col, Row } from "../atoms";

import bg from "~/images/background/battle.webp";
import Image from "next/image";

interface BattlePropsType {}

export const Battle: FunctionComponent<BattlePropsType> = () => {
  return (
    <Col className="h-screen justify-center">
      <Col className="items-center">
        <BattleIcon size={44} fill="white" />
        <h1 className="text-4xl font-extrabold">Great war is near.</h1>
        <h2 className="text-2xl font-extrabold"> Are You Ready ?</h2>
      </Col>

      <Image
        priority
        src={bg}
        alt={"battle"}
        className="absolute h-full top-0 left-0 w-full -z-10 object-cover "
      />
    </Col>
  );
};
