"use client";
import React, { useState } from "react";
import { Button, Col, Drawer, Row } from "@/components";
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
      <button aria-label={`About ${title}`} className="w-6 h-6 rounded-md overflow-hidden active:scale-95 transition-transform" type="button" onClick={() => setIsOpen(true)}>
        <Image alt="" className="w-full h-full" src={info} />
      </button>
      <Drawer isOpen={isOpen} position="bottom" onClose={() => setIsOpen(false)}>
        <Col className="items-center text-center gap-3 pt-1">
          <Image alt="" className="w-16 h-16 rounded-xl" src={info} />
          <p className="title-screen">{title}</p>
          <p className="text-sub text-[15px] leading-snug max-w-[320px]">{content}</p>
          <Button isFull size="large" onClick={() => setIsOpen(false)}>
            Got it
          </Button>
        </Col>
      </Drawer>
    </Row>
  );
};
