import { resourceCapacity, TResource } from "../templates";
export const ActiveResource = ({
  activeResource,
  onConsumeEnergy,
}: {
  activeResource: TResource;
  onConsumeEnergy: () => void;
}) => {
  return (
    <div className="flex w-full items-center flex-col">
      <div className="flex gap-1 text-[38px]">
        <p>{activeResource.count}</p>
        <p>/</p>
        <p>{resourceCapacity}</p>
      </div>
      <div className="h-2 relative w-[290px]">
        <div className="h-full bg-white rounded-[10px] shadow-inner relative" />
        <div
          style={{
            width: (activeResource.count * 100) / resourceCapacity + "%",
          }}
          className={`h-full rounded-[10px] top-0 absolute ${activeResource?.color}`}
        />
      </div>
      <div
        onClick={
          activeResource.count < resourceCapacity
            ? onConsumeEnergy
            : () => console.log("capacity needed")
        }
        className="w-[260px] h-[260px] my-4"
      >
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
