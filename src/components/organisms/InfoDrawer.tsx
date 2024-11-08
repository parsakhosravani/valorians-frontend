"use client";
import React, { useState } from "react";
import { Button, Col, Drawer, Row, TextImage } from "@/components";
import info from "~/images/info.webp";
import Image from "next/image";

interface InfoDrawerProps {
  title: string;
  content: React.ReactNode;
}

export const InfoDrawer: React.FC<InfoDrawerProps> = ({ title, content }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Row className="text-center justify-center">
      <Image onClick={() => setIsOpen(true)} width={18} alt="info" src={info} />
      <Drawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        position="bottom"
      >
        <Col className="justify-center items-center gap-5">
          <TextImage
            size="large"
            direction="column"
            imgSrc={info}
            imgAlt="info"
          >
            <p className="text-2xl font-black">{title}</p>
            <p className="text-[#B5C7DE]">{content}</p>
          </TextImage>
          <Button isFull onClick={() => setIsOpen(false)}>
            Got it
          </Button>
        </Col>
      </Drawer>
    </Row>
  );
};
