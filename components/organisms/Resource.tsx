import React, { FunctionComponent } from "react";
import { resourceCapacity, TResource } from "../templates";
import { ProgressBar } from "../molecules";

interface resourcePropsType {
  resourceData: TResource;
  isActive: boolean;
  onChangeResource: (resourceData: TResource) => void;
}

export const Resource: FunctionComponent<resourcePropsType> = ({
  resourceData,
  isActive,
  onChangeResource: onChangeResourceHandler,
}) => {
  return (
    <div
      className="flex w-full border-1 border-transparent bg-[#212F42] rounded h-[40px] px-[2px] overflow-hidden relative"
      style={
        isActive
          ? {
              border: "1px solid #00A3FF",
              backgroundColor: "#191F27",
            }
          : {}
      }
      onClick={() => {
        onChangeResourceHandler(resourceData);
      }}
    >
      <div className="flex flex-col justify-between w-full">
        <div className="text-white text-[10px] font-semibold">
          {resourceData.count}
        </div>
        <ProgressBar
          size="small"
          value={resourceData.count}
          totalValue={resourceCapacity}
          color={resourceData.color}
        />
        <div className="text-zinc-400 text-[8px] w-full font-semibold">
          +100 per hour
        </div>
        <img
          width={30}
          height={30}
          className="absolute rounded-[5px] right-[-8px] bottom-[-5px]"
          src={resourceData.img}
        />
      </div>
    </div>
  );
};
