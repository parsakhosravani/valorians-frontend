import React, { FunctionComponent } from "react";
import { Building } from "../organisms";

interface TribePropsType {}

export const Tribe: FunctionComponent<TribePropsType> = () => {
  return (
    <div className="bg-tribe -z-10 fixed top-0 bg-no-repeat bg-cover bg-center  items-center justify-center w-full h-full p-2">
      <div className="bg-tribe pt-12 fixed top-0 bg-no-repeat bg-cover bg-center w-full h-full p-2 overflow-hidden">
        <div className="flex flex-col items-center justify-center h-full overflow-y-auto">
          <div className="grid grid-cols-2 gap-4 max-w-md">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="w-full">
                <Building />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
