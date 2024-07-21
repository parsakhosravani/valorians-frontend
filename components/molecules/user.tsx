import { Avatar } from "@nextui-org/avatar";

export const User = () => {
  return (
    <div className="flex gap-1">
      <Avatar />
      <div className="flex flex-col">
        <div className="text-center text-white text-base font-bold">
          ierfaaan
        </div>
        <div className="text-neutral-400 text-xs font-bold">Rank 1000</div>
      </div>
    </div>
  );
};
