type TResource = { img: string; color: string };
export const Resource = ({ img, color }: TResource) => {
  return (
    <div className="w-[86.50px] h-10 relative bg-neutral-900 rounded">
      <div className="left-[1.50px] top-[4px] absolute text-center text-white text-[10px] font-semibold font-['Noto Rashi Hebrew']">
        1,000,000,000
      </div>
      <div className="left-[2.50px] top-[28px] absolute text-zinc-400 text-[8px] font-semibold font-['Noto Rashi Hebrew']">
        +100 per hour
      </div>
      <div className="w-[62.50px] h-1 left-[2.50px] top-[20px] absolute">
        <div className="w-[62.16px] h-1 left-[0.34px] top-0 absolute bg-white rounded-[10px] shadow-inner" />
        <div
          className={`w-[24.59px] h-1 left-0 top-0 absolute ${color} rounded-[10px]`}
        />
      </div>
      <img
        width={16}
        height={16}
        className=" left-[56px] top-[13px] absolute rounded-[5px]"
        src={img}
      />
    </div>
  );
};
