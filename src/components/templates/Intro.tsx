"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export const Intro = () => {
  const [progressBarStart, setProgressBarStart] = useState(0);
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => {
      setProgressBarStart(100);
    }, 500);
    setTimeout(() => {
      router.push("/resources");
    }, 3000);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="fixed left-0 right-0 top-0 bottom-0 z-50 bg-intro bg-cover bg-no-repeat">
      <div className="fixed left-0 right-0 bottom-0 flex h-48 w-80 flex-col justify-between px-[57px] pb-[33px] pt-[26px] mx-auto">
        <div className="relative flex h-[11px] w-full items-center justify-left overflow-hidden rounded-full bg-white transition-all delay-100">
          <div
            className={clsx(
              "h-[15px] w-0 rounded bg-[#0695E5] transition-all duration-[3s] ease-in-out hxs:left-[1.5%] hxs:top-[50%] z-20",
              progressBarStart === 100 && "w-[100%]"
            )}
          />
        </div>
      </div>
    </div>
  );
};
