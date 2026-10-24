# Valorians design system

Everything you see in the game is drawn in code. There are no raster images except the social brand marks and the QR code.

## Where things live

| What | File |
| --- | --- |
| Colour, type, radius, shadow, motion tokens | `src/design/tokens.ts` (Tailwind reads it) |
| Art materials (3-tone colours) | `src/art/palette.ts` |
| Isometric drawing kit | `src/art/iso.tsx` |
| Buildings (24) | `src/art/buildings.tsx` → `<BuildingArt id level />` |
| Troops, Daily Mine nodes, default avatar | `src/art/units.tsx` → `<TroopArt>`, `<ResourceNode>`, `<AvatarArt>` |
| Game icons (resources, stats) | `src/art/icons.tsx` → `<GameIcon id size />` |
| Background landscapes | `src/art/scenes.tsx` → `<Scene kind />` |
| UI components | `src/components/ui` |
| Line icons for the interface | `src/components/ui/Icon.tsx` → `<Icon name />` |

## Type

- **Grenze** (600–800) for titles, numbers in the spotlight and buttons: `font-display`.
- **Nunito** (400–900) for everything else. Numbers use tabular figures.
- Sizes: `text-display-xl` 34, `display-lg` 26, `display-md` 20, `title` 16, `body` 15, `small` 13, `caption` 11.

## Colour

- `ink-*`: dark surfaces. App background `ink-900`, cards `ink-800`, raised `ink-700`, borders `ink-500`.
- `parch-*`: text. Primary `parch` (100), secondary `parch-300`, muted `parch-500`.
- `gold-*`: the accent. Primary actions, highlights, gold text `gold-300`.
- `ember-*`: attack and danger. `moss-*` good, `blood-*` bad, `sky-*` info.
- `res.*`: one colour per resource.

Older names (`ground`, `panel`, `goldtext`, `muted`…) still work and point at the same tokens.

## Components

`Button` (primary, secondary, ghost, danger · sm, md, lg), `IconButton`, `Card` (default, raised, gold, danger, sunken), `SectionTitle`, `Overline`, `Badge`, `LevelShield`, `Amount` (icon + number), `Stat`, `Meter`, `Segmented`, `Stepper`, `Avatar`, `Sheet` (bottom sheet), `Empty`, `Spinner`, `ArtTile`, `Backdrop`.

## Art rules

1. 128×128 box, ground origin at (64, 98), 2:1 isometric. x runs to the lower right, y to the lower left, z up.
2. Three flat tones per material: top (lit), left face (half lit), right face (shade). Light from the upper left.
3. One outline everywhere: `#2B1F15`, 1.3px, round joins.
4. Draw back to front (smaller x + y first).
5. Buildings stand on a plate. `tier` grows with level: 0 is a pale plan, 2 adds a banner, 3 turns the banners gold.
6. Use the materials in `palette.ts`; don't invent new colours in a drawing.

Run `bun tools/art-sheet.tsx [level]` to render every building to `art-sheet.html`.
