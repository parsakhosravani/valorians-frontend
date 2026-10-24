"use client";
import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { LoadingScreen } from "./LoadingScreen";

/** The app's entry: show the loading screen, then go to the Hall. */
export const Intro = () => {
  const router = useRouter();
  const onDone = useCallback(() => router.replace("/hall" as any), [router]);

  return <LoadingScreen onDone={onDone} />;
};
