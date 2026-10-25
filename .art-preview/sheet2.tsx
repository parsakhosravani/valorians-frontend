import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TroopArt, ResourceNode, AvatarArt } from "../src/art/units";
import { GameIcon } from "../src/art/icons";
const icons = ["coin","iron","wood","clay","crop","population","builder","time","building","energy","attack","defense","loot","trophy","chest","info","shield-time"] as const;
const cell = { background: "#2A221B", borderRadius: 10, padding: 6 } as const;
const html = renderToStaticMarkup(
  <div style={{ background: "#1F1914", padding: 12, color: "#eee", fontFamily: "sans-serif" }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 220px)", gap: 8 }}>
      {["spearman","archer","cavalry","ram"].map((id) => <div key={id} style={cell}><TroopArt id={id} className="a" /></div>)}
      {["iron","wood","clay","crop"].map((id) => <div key={id} style={cell}><ResourceNode id={id} className="a" /></div>)}
    </div>
    <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
      {icons.map((id) => <div key={id} style={{ ...cell, display: "flex", gap: 6, alignItems: "center" }}><GameIcon id={id} size={48} /><GameIcon id={id} size={20} /></div>)}
      {[0,1,2].map((s) => <div key={s} style={{ width: 64, height: 64, borderRadius: 14, overflow: "hidden" }}><AvatarArt seed={s} /></div>)}
    </div>
  </div>
);
await Bun.write(`/tmp/claude-0/t/art/sheet2.html`, `<html><body style="margin:0"><style>.a{width:208px;height:208px;display:block}</style>${html}</body></html>`);
