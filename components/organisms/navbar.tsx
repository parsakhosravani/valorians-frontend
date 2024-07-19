export const Navbar = () => {
  return (
    <div className="w-[390px] h-[68px] left-[-2px] top-[668px] absolute">
      <div className="w-[390px] h-[66px] left-0 top-[2px] absolute bg-neutral-900 rounded-tl-[30px] rounded-tr-[30px] backdrop-blur-sm" />
      <div className="w-[56.33px] h-[46.24px] left-[21px] top-[12px] absolute flex-col justify-center items-center gap-[5px] inline-flex">
        <img className="w-6 h-6 relative" src="./images/navs/resources.png" />

        <div className="self-stretch h-3 flex-col justify-center items-center gap-1 flex">
          <div className="self-stretch text-center text-white text-[10px] font-bold">
            Resources
          </div>
        </div>
      </div>
      <div className="w-[56.33px] h-[46.32px] left-[95px] top-[12px] absolute flex-col justify-center items-center gap-[5px] inline-flex">
        <img className="w-6 h-6 relative" src="./images/navs/kingdom.png" />

        <div className="self-stretch h-3 flex-col justify-center items-center gap-1 flex">
          <div className="self-stretch text-center text-white/opacity-50 text-[10px] font-bold">
            kingdom
          </div>
        </div>
      </div>
      <div className="w-[56.33px] h-[46.32px] left-[168px] top-[12px] absolute flex-col justify-center items-center gap-[5px] inline-flex">
        <img className="w-6 h-6 relative" src="./images/navs/army.png" />

        <div className="self-stretch h-3 flex-col justify-center items-center gap-1 flex">
          <div className="self-stretch text-center text-white/opacity-50 text-[10px] font-bold">
            Army
          </div>
        </div>
      </div>
      <div className="w-[56.33px] h-[47.45px] left-[314.63px] top-[12px] absolute flex-col justify-center items-center gap-[5px] inline-flex">
        <img className="w-6 h-6 relative" src="./images/navs/world.png" />
        <div className="self-stretch h-[13px] flex-col justify-center items-center gap-1 flex">
          <div className="self-stretch text-center text-white/opacity-50 text-[11px] font-bold">
            World
          </div>
        </div>
      </div>
      <div className="w-[56.33px] h-[46.32px] left-[241px] top-[12px] absolute flex-col justify-center items-center gap-[5px] inline-flex">
        <img className="w-6 h-6 relative" src="./images/navs/allies.png" />
        <div className="self-stretch h-3 flex-col justify-center items-center gap-1 flex">
          <div className="self-stretch text-center text-white/opacity-50 text-[10px] font-bold">
            Allies
          </div>
        </div>
      </div>
    </div>
  );
};
