import {
  FriendsIcon,
  KingdomIcon,
  QuestIcon,
  ResourcesIcon,
  WarIcon,
} from "../atoms";

export const Navbar = () => {
  return (
    <div className="text-[11px] pt-2 flex px-6 items-center justify-between bg-[#191F27] w-full h-[60px] rounded-t-3xl">
      <div className="flex flex-col justify-center items-center gap-1 flex-1">
        <ResourcesIcon />
        <p>Resources</p>
      </div>
      <div className="flex flex-col justify-center items-center gap-1 flex-1">
        <KingdomIcon />
        <p>Kingdom</p>
      </div>
      <div className="flex flex-col justify-center items-center gap-1 flex-1">
        <WarIcon />
        <p>War</p>
      </div>
      <div className="flex flex-col justify-center items-center gap-1 flex-1">
        <FriendsIcon />
        <p>Friends</p>
      </div>
      <div className="flex flex-col justify-center items-center gap-1 flex-1">
        <QuestIcon />
        <p>Quest</p>
      </div>
    </div>
  );
};
