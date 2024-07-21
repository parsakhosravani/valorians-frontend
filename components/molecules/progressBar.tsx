"use client";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export const ProgressBar = () => {
  const [progressBarStart, setProgressBarStart] = useState(0);
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => {
      setProgressBarStart(100);
    }, 500);
    setTimeout(() => {
      router.push("resources");
    }, 3000);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="relative flex h-[11px] w-full items-center justify-left overflow-hidden rounded-full bg-white px-[2px] transition-all delay-100">
      <div
        className={clsx(
          "h-[7px] w-0 rounded bg-[#B86843] transition-all duration-[3s] ease-in-out hxs:left-[1.5%] hxs:top-[50%] z-20",
          progressBarStart === 100 && "w-[99%]"
        )}
      />
    </div>
  );
};
