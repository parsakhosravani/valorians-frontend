import {
  FriendsIcon,
  IconSvgProps,
  KingdomIcon,
  QuestIcon,
  ResourcesIcon,
  WarIcon,
} from "../atoms";

type TNavbarItems = {
  icon: React.ReactElement<IconSvgProps>;
  name: string;
};

const navbarItems: TNavbarItems[] = [
  {
    icon: <ResourcesIcon />,
    name: "Resources",
  },
  {
    icon: <KingdomIcon />,
    name: "Kingdom",
  },
  {
    icon: <WarIcon />,
    name: "War",
  },
  {
    icon: <FriendsIcon />,
    name: "Friends",
  },
  {
    icon: <QuestIcon />,
    name: "Quest",
  },
];

export const Navbar = () => {
  return (
    <div className="text-[11px] border-t-2 border-[#019AF0] pt-2 flex px-6 items-center justify-between bg-[#191F27] w-full h-[60px] rounded-t-3xl">
      {navbarItems.map((item) => (
        <div className="flex flex-col justify-center items-center gap-1 flex-1">
          {item.icon}
          <p>{item.name}</p>
        </div>
      ))}
    </div>
  );
};
