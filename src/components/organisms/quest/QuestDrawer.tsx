"use client";
import { Button, Row } from "@/components";
import { Drawer, TextImage } from "@/components/molecules";
import telegram from "~/images/social/telegram.png";
import youtube from "~/images/social/youtube.png";
import x from "~/images/social/x.png";
import { StaticImageData } from "next/image";
interface QuestDrawerProps {
  className?: string;
  setOpenDrawer: (
    value: React.SetStateAction<QuestDrawerContent | null>
  ) => void;
  openDrawer: QuestDrawerContent | null;
}
export enum QuestDrawerContent {
  TELEGRAM = "Join our Telegram Channel",
  YOUTUBE = "Subscribe our Yotube Channel",
  X = "Follow our X Account",
}

export type TSocialLinks = {
  icon: StaticImageData;
  title: QuestDrawerContent;
};

export const socialLinks = [
  { icon: telegram, title: QuestDrawerContent.TELEGRAM },
  { icon: youtube, title: QuestDrawerContent.YOUTUBE },
  { icon: x, title: QuestDrawerContent.X },
] as TSocialLinks[];

export const QuestDrawer: React.FC<QuestDrawerProps> = ({
  setOpenDrawer,
  openDrawer,
}) => {
  return (
    <Drawer
      position="bottom"
      onClose={() => setOpenDrawer(null)}
      isOpen={openDrawer !== null}
    >
      <Row className="pb-4 justify-center">
        {openDrawer === QuestDrawerContent.TELEGRAM && (
          <TextImage
            direction="column"
            imgSrc={socialLinks[0].icon}
            imgAlt={socialLinks[0].title}
            title={socialLinks[0].title}
            size="large"
          />
        )}
        {openDrawer === QuestDrawerContent.YOUTUBE && (
          <TextImage
            direction="column"
            imgSrc={socialLinks[1].icon}
            imgAlt={socialLinks[1].title}
            title={socialLinks[1].title}
            size="large"
          />
        )}
        {openDrawer === QuestDrawerContent.X && (
          <TextImage
            direction="column"
            imgSrc={socialLinks[2].icon}
            imgAlt={socialLinks[2].title}
            title={socialLinks[2].title}
            size="large"
          />
        )}
      </Row>

      <Button size="large" isFull>
        Claim Reward
      </Button>
    </Drawer>
  );
};
