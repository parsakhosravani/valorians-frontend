import { ROUTES } from "@/constants/routes";
import {
  FriendsIcon,
  IconSvgProps,
  QuestIcon,
  ResourcesIcon,
  TribeIcon,
  BattleIcon,
} from "../atoms";
import Link from "next/link";

type TNavbarItems = {
  icon: React.ReactElement<IconSvgProps>;
  name: string;
  link: (typeof ROUTES)[keyof typeof ROUTES];
};

const navbarItems: TNavbarItems[] = [
  {
    icon: <ResourcesIcon />,
    name: "Resources",
    link: ROUTES.RESOURCES,
  },
  {
    icon: <TribeIcon />,
    name: "Tribe",
    link: ROUTES.TRIBE,
  },
  {
    icon: <BattleIcon />,
    name: "Battle",
    link: ROUTES.BATTLE,
  },
  {
    icon: <FriendsIcon />,
    name: "Friends",
    link: ROUTES.FRIENDS,
  },
  {
    icon: <QuestIcon />,
    name: "Quest",
    link: ROUTES.QUEST,
  },
];

export const Navbar = () => {
  return (
    <div className="text-[11px] border-t-2 border-[#019AF0] pt-2 flex px-6 items-center justify-between bg-[#191F27] w-full h-[60px] rounded-t-3xl">
      {navbarItems.map((item) => (
        <Link href={item.link}>
          <div className="flex flex-col justify-center items-center gap-1 flex-1">
            {item.icon}
            <p>{item.name}</p>
          </div>
        </Link>
      ))}
    </div>
  );
};
