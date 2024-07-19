import { Avatar } from "@nextui-org/avatar";

export const User = () => {
  return (
    <>
      <div className="w-[37px] h-[37px] left-[13px] top-[13px] absolute ">
        <Avatar isBordered={false} />;
      </div>
      <div className="left-[56px] top-[15px] absolute text-center text-white text-base font-bold">
        ierfaaan
      </div>
      <div className="w-[85px] h-[17px] left-[56px] top-[33px] absolute text-neutral-400 text-xs font-bold">
        Rank 1000
      </div>
    </>
  );
};
