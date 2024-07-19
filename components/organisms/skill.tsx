export const Skill = () => {
  return (
    <div className="w-[353.77px] h-10 left-[16px] top-[579px] absolute">
      <div className="w-10 h-10 p-2.5 left-[209.77px] top-0 absolute bg-neutral-900 rounded-[100px] border-2 border-orange-400">
        <img src="./images/energy/database.png" />
      </div>
      <div className="w-10 h-10 p-2.5 left-[261.77px] top-0 absolute bg-neutral-900 rounded-[100px] border-2 border-orange-400 flex-col justify-center items-center gap-2.5 inline-flex">
        <img src="./images/energy/mine.png" />
      </div>
      <div className="w-10 h-10 p-2.5 left-[313.77px] top-0 absolute bg-neutral-900 rounded-[100px] border-2 border-orange-400 flex-col justify-center items-center gap-2.5 inline-flex">
        <img src="./images/energy/boost.png" />
      </div>
      <div className="w-[161.77px] h-[27.32px] left-0 top-[7px] absolute">
        <img src="./images/energy/energy.png" />
        <div className="left-[24.77px] top-[0.11px] absolute text-white text-xl font-semibold leading-relaxed">
          200 / 4,000
        </div>
      </div>
    </div>
  );
};
