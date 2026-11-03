import { ErrorPage } from "@/components/templates/ErrorPage";

/** A link to a page that doesn't exist (an old bot button, a typo). */
export default function NotFound() {
  return <ErrorPage href="/hall" kind="missing" />;
}
