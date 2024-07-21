type TSkill = { energy: number };
export const Skill = ({ energy }: TSkill) => {
  return (
    <div className="flex justify-between px-2">
      <div className="flex items-center gap-2">
        <div className="w-[40px] h-[40px] border"></div>
        <p className="text-[18px]">{4000 - energy} / 4000</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-[40px] h-[40px] border-2 border-[#FCA234] rounded-full bg-[#0F1114]"></div>
        <div className="w-[40px] h-[40px] border-2 border-[#FCA234] rounded-full bg-[#0F1114]"></div>
        <div className="w-[40px] h-[40px] border-2 border-[#FCA234] rounded-full bg-[#0F1114]"></div>
      </div>
    </div>
  );
};
