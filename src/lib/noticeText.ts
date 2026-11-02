/**
 * Bot messages are Telegram HTML with only <b> tags and escaped names
 * (see esc() in server/notify.ts). This splits one into plain pieces, so the
 * game shows it without ever putting server HTML into the page.
 */
export type NoticePart = { text: string; bold: boolean };

const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function noticeParts(html: string): NoticePart[] {
  const parts: NoticePart[] = [];
  let bold = false;

  for (const piece of html.split(/(<\/?b>)/)) {
    if (piece === "<b>") bold = true;
    else if (piece === "</b>") bold = false;
    else if (piece) parts.push({ text: unescape(piece), bold });
  }

  return parts;
}

/** The whole message as plain text (for a toast). */
export const noticePlain = (html: string) => noticeParts(html).map((p) => p.text).join("");
