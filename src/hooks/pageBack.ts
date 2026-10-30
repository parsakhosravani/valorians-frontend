/** Home: no back button. */
const HOME = new Set(["/", "/hall", "/qrcode"]);
/** The bottom bar's tabs: back goes to the Hall. Everything else goes back where you came from. */
const TABS = new Set(["/tribe", "/battle", "/clan", "/resources"]);

/**
 * What back does on a page with nothing open over it: nothing (home, so no
 * button), go to the Hall, or go back to the page before (`visited`: pages
 * seen this session, this one included).
 */
export function pageBack(pathname: string, visited: number): "none" | "hall" | "back" {
  if (HOME.has(pathname)) return "none";

  return TABS.has(pathname) || visited <= 1 ? "hall" : "back";
}
