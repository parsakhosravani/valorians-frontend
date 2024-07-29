import React, { FunctionComponent } from "react";
import { ProgressBar, TextImage } from "../molecules";
import { TResource } from "@/context/ResourceContext";

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
              background: "#B1D7ED",
              color: "#212F42",
            }
          : {
              border: "1px solid transparent",
            }
      }
      onClick={() => {
        onChangeResourceHandler(resourceData);
      }}
    >
      <TextImage
        imgAlt={resourceData.name}
        imgSrc={resourceData.img}
        title={resourceData.name}
      />
      <div className="flex flex-col justify-between w-full gap-[2px]">
        <div className="text-center text-xs font-semibold">
          {resourceData.count.toLocaleString("en-US")}
        </div>
        <ProgressBar
          size="small"
          value={resourceData.count}
          totalValue={resourceCapacity}
        />
        <div className="text-center text-[8px] w-full font-semibold">
          +100 per hour
        </div>
      </div>
    </div>
  );
};
