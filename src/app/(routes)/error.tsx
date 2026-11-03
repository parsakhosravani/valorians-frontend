"use client";

import { useEffect } from "react";

import { ErrorPage } from "@/components/templates/ErrorPage";

/** A screen crashed: the one error page, with a retry. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorPage kind="crash" onAction={reset} />;
}
