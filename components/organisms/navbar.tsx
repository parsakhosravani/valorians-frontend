import {
  FriendsIcon,
  KingdomIcon,
  QuestIcon,
  ResourcesIcon,
  WarIcon,
} from "../atoms";

export const Navbar = () => {
  return (
    <div className="text-[11px] pt-2 flex px-6 items-center justify-between bg-[#191F27] w-full h-[60px] rounded-t-3xl border-t-3 border-t-[#019AF0]">
      <div className="flex flex-col justify-center items-center gap-1">
        <ResourcesIcon />
        <p>Resources</p>
      </div>
      <div className="flex flex-col justify-center items-center gap-1">
        <KingdomIcon />
        <p>kingdom</p>
      </div>
      <div className="flex flex-col justify-center items-center gap-1">
        <WarIcon />
        <p>war</p>
      </div>
      <div className="flex flex-col justify-center items-center gap-1">
        <FriendsIcon />
        <p>friends</p>
      </div>
      <div className="flex flex-col justify-center items-center gap-1">
        <QuestIcon />
        <p>quest</p>
      </div>
    </div>
  );
};
