type TSkill = { icon: string };
export const skill = ({ icon }: TSkill) => {
  return (
    <div className="w-[40px] h-[40px] flex items-center justify-center border-2 border-[#FCA234] rounded-full bg-[#0F1114]">
      {icon}
    </div>
  );
};
