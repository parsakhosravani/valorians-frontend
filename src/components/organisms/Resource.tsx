import React, { FunctionComponent } from "react";
import { TResource } from "../templates";
import { ProgressBar } from "../molecules";

interface resourcePropsType {
  resourceData: TResource;
  isActive: boolean;
  resourceCapacity: number;
  onChangeResource: (resourceData: TResource) => void;
}

export const Resource: FunctionComponent<resourcePropsType> = ({
  resourceData,
  isActive,
  resourceCapacity,
  onChangeResource: onChangeResourceHandler,
}) => {
  return (
    <div
      className="flex flex-col w-full shadow-xl bg-[#212F42] rounded p-[3px]"
      style={
        isActive
          ? {
              border: "1px solid #00A3FF",
            }
          : {
              border: "1px solid transparent",
            }
      }
      onClick={() => {
        onChangeResourceHandler(resourceData);
      }}
    >
      <div className="flex items-center justify-center gap-[2px]">
        <img width={18} height={18} src={resourceData.img} />
        <p className="text-[13px]">{resourceData.name.toLocaleUpperCase()}</p>
      </div>
      <div className="flex flex-col justify-between w-full gap-[2px]">
        <div className="text-white text-center text-[10px] font-semibold">
          {resourceData.count}
        </div>
        <ProgressBar
          size="small"
          value={resourceData.count}
          totalValue={resourceCapacity}
        />
        <div className="text-zinc-400 text-center text-[8px] w-full font-semibold">
          +100 per hour
        </div>
      </div>
    </div>
  );
};
