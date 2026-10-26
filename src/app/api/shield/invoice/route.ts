import { handler } from "@/server/http";
import { createShieldInvoice } from "@/server/shields";

export const dynamic = "force-dynamic";

/** A one-time Telegram Stars invoice for a shield; the app opens it with WebApp.openInvoice. */
export const POST = handler(async ({ player, body }) => ({ link: await createShieldInvoice(player.id, body?.shield) }));
