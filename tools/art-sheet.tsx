// Renders every building to art-sheet.html: bun tools/art-sheet.tsx [level]
import { writeFileSync } from "fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BUILDING_ART, BuildingArt } from "../src/art/buildings";
const ids = Object.keys(BUILDING_ART);
const lv = Number(process.argv[2] ?? 1);
const html = renderToStaticMarkup(
  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 200px)", gap: 8, background: "#1F1914", padding: 12, fontFamily: "sans-serif", color: "#eee" }}>
    {ids.map((id) => (
      <div key={id} style={{ background: "#2A221B", borderRadius: 10, padding: 6 }}>
        <BuildingArt id={id} level={lv} className="a" />
        <div style={{ fontSize: 12, textAlign: "center" }}>{id}</div>
      </div>
    ))}
  </div>
);
writeFileSync("art-sheet.html", `<html><body style="margin:0"><style>.a{width:188px;height:188px;display:block}</style>${html}</body></html>`);
