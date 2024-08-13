"use client";
import React, { useState } from "react";
import { Drawer } from "../molecules/Drawer";
import { Button, Col } from "../atoms";
import info from "~/images/info.webp";
import Image from "next/image";
import { TextImage } from "../molecules";

interface InfoDrawerProps {
  title: string;
  content: React.ReactNode;
}

export const InfoDrawer: React.FC<InfoDrawerProps> = ({ title, content }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Image onClick={() => setIsOpen(true)} width={18} alt="info" src={info} />
      <Drawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        position="bottom"
      >
        <Col className="justify-center items-center space-y-8">
          <TextImage
            size="large"
            direction="column"
            imgSrc={info}
            imgAlt="info"
            title={title}
          />
          {content}
          <Button isFull onClick={() => setIsOpen(false)}>
            Got it
          </Button>
        </Col>
      </Drawer>
    </>
  );
};
