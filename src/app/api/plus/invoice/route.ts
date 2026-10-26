import { handler } from "@/server/http";
import { createPlusInvoice } from "@/server/plus";

export const dynamic = "force-dynamic";

/** A Telegram Stars subscription invoice for Valorians Plus; the app opens it with WebApp.openInvoice. */
export const POST = handler(async ({ player }) => ({ link: await createPlusInvoice(player.id) }));
