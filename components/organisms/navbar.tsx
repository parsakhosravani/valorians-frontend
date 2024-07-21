export const Navbar = () => {
  return (
    <div className="text-[11px] pt-2 flex px-6 items-center justify-between bg-[#191F27] w-full h-[60px] rounded-t-3xl border-t-3 border-t-[#019AF0]">
      <div className="flex flex-col justify-center items-center gap-1">
        <div className="w-[24px] h-[24px] border"></div>
        <p>Resources</p>
      </div>
      <div className="flex flex-col justify-center items-center gap-1">
        <div className="w-[24px] h-[24px] border"></div>
        <p>kingdom</p>
      </div>
      <div className="flex flex-col justify-center items-center gap-1">
        <div className="w-[24px] h-[24px] border"></div>
        <p>war</p>
      </div>
      <div className="flex flex-col justify-center items-center gap-1">
        <div className="w-[24px] h-[24px] border"></div>
        <p>friends</p>
      </div>
      <div className="flex flex-col justify-center items-center gap-1">
        <div className="w-[24px] h-[24px] border"></div>
        <p>quest</p>
      </div>
    </div>
  );
};
