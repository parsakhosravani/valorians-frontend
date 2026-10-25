import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Scene } from "../src/art/scenes";
const kinds = ["dusk","battle","night","feast","road","iron","wood","clay","crop"] as const;
const html = renderToStaticMarkup(
  <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 195px)", gap: 6, background: "#111", padding: 6 }}>
    {kinds.map((k) => <Scene key={k} kind={k} className="s" />)}
  </div>
);
await Bun.write(`/tmp/claude-0/t/art/sheet3.html`, `<html><body style="margin:0"><style>.s{width:195px;height:422px;display:block}</style>${html}</body></html>`);
