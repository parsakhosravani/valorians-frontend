import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync, mkdirSync } from "fs";
import { BUILDING_ART, BuildingArt } from "../src/art/buildings";
import { TroopArt, ResourceNode, AvatarArt } from "../src/art/units";
import { GameIcon } from "../src/art/icons";
import { Scene } from "../src/art/scenes";
const out = "/tmp/claude-0/-home-claude/57d4cf4d-cb5b-5a8e-a866-f7274920f677/scratchpad/ds/svg";
const fix = (s: string) => s.replace(/^<svg /, '<svg xmlns="http://www.w3.org/2000/svg" ');
const w = (dir: string, name: string, el: React.ReactElement) => { mkdirSync(out + "/" + dir, { recursive: true }); writeFileSync(out + "/" + dir + "/" + name + ".svg", fix(renderToStaticMarkup(el))); };
for (const id of Object.keys(BUILDING_ART)) { w("Buildings", id, <BuildingArt id={id} level={1} />); }
for (const id of ["spearman","archer","cavalry","ram"]) w("Troops", id, <TroopArt id={id} />);
for (const id of ["iron","wood","clay","crop"]) w("Resource nodes", id, <ResourceNode id={id} />);
for (const id of ["coin","iron","wood","clay","crop","population","builder","time","building","energy","attack","defense","loot","trophy","chest","info","shield-time"] as const) w("Game icons", id, <GameIcon id={id} size={64} />);
for (const k of ["dusk","battle","night","feast","road","iron","wood","clay","crop"] as const) w("Scenes", k, <Scene kind={k} />);
w("Brand", "avatar", <AvatarArt seed={0} />);
