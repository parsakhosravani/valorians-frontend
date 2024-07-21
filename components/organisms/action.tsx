import { TResource } from "../templates";

export const Action = ({ activeResource }: { activeResource: TResource }) => {
  return (
    <div className="flex w-full items-center flex-col">
      <div className="flex gap-1 text-[38px]">
        <p>1000000</p>
        <p>/</p>
        <p>1.2M</p>
      </div>
      <div className="h-2 relative w-[290px]">
        <div className="h-full bg-white rounded-[10px] shadow-inner relative" />
        <div
          className={`w-1/2 h-full rounded-[10px] top-0 absolute ${activeResource?.color}`}
        />
      </div>
      <div className="w-[260px] h-[260px] my-4">
        <img src={activeResource?.img} alt="iron" />
      </div>
      <div>
        <h1 className="text-[46px]">{activeResource?.name}</h1>
      </div>
      <img
        src={activeResource?.bg}
        alt="bg"
        style={{ backgroundPosition: "center", backgroundSize: "100%" }}
        className="fixed left-0 right-0 top-0 bottom-0 -z-10 opacity-[0.1]"
      />
    </div>
  );
};
