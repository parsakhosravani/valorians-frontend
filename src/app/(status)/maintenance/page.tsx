import { ErrorPage } from "@/components/templates/ErrorPage";

export const dynamic = "force-dynamic";

/** Shown on every screen while MAINTENANCE=on (see proxy.ts). MAINTENANCE_MESSAGE can say more. */
export default function Maintenance() {
  return <ErrorPage detail={process.env.MAINTENANCE_MESSAGE} href="/hall" kind="maintenance" />;
}
