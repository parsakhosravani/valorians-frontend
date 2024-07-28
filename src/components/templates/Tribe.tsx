import React, { FunctionComponent } from "react";
import { Building } from "../organisms";

interface TribePropsType {}

export const Tribe: FunctionComponent<TribePropsType> = () => {
  return (
    <div className="bg-tribe fixed  bg-no-repeat bg-cover bg-center -z-10 items-center justify-center w-full h-full ">
      <div className="m-2 my-0">
        <div className="grid grid-cols-2 gap-2.5 w-full">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((item) => (
            <div key={item}>
              <Building />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
