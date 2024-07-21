import React, { FunctionComponent } from "react";
import { TResource } from "../templates";

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
      className="flex w-full border-1 border-transparent bg-[#080808] rounded h-[40px] px-[2px] overflow-hidden relative"
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

        <div className="h-1 relative w-[60px]">
          <div className="h-full bg-white rounded-[10px] shadow-inner relative" />
          <div
            style={{ width: (resourceData.count * 100) / 1200000 + "%" }}
            className={`w-[24.59px] h-full rounded-[10px] top-0 absolute ${resourceData.color}`}
          />
        </div>
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
