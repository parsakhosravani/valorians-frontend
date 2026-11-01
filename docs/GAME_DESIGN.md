# Game design decisions

The owner's decisions about how Valorians Legend should play. When code and this file disagree,
ask before "fixing" either. Add new decisions here when they are made.

## Vocabulary

- **Tribe / village** — the player's home. **Build** page = `/tribe`. **War** page = `/battle`.
- **City Gate** — the wall building. **Hideout** — protects some resources from raiders.
- **Camp** — a barbarian camp (PvE). **Lair** — a bandit lair near villages.
- **Regiment** — all troops of one type; they share XP and rank.

## Buildings and village

- Buildings have **no max level**.
- The **Build page is the list only**. The village picture lives on the **War map**:
  zooming in on your own tribe shows its buildings.
- The village uses a **natural layout**, not a tidy grid of rows.
- The **wall's look upgrades with City Gate level** (wood, then stone, and onward without end).
- Wall art comes from **Gemini-generated sprite sheets** the owner makes — don't hand-draw walls.
  Dragon art also comes from the owner's Gemini images.
- The Hall shows **urgent alerts on top**, then short next steps.

## War

- A **won raid knocks the City Gate down some levels**, even when the tribe is empty.
- The **Hospital saves only wounded troops, never the killed**.
- **Trapmaker catches attackers** before the battle (it does not just add defense).
- **Hideout** protection is capped.
- **Raid shield grows** when a player is raided again and again.
- Attacking a **much weaker target gives half loot**.
- Knight and Paladin are strong elite cavalry.
- **Dragon:** one per player, very expensive, flies straight to the target, **carries no loot**.
- **Bandit raids** hit villages from nearby lairs, with an **advance warning** and a chance to
  clear the lair first.
- **Barbarian camps are endless** (no level-30 cap) and have **names, not numbers**.
  Rewards past level 30 were too high; they now grow gently while camps keep getting tougher.

## Economy

- When **crop runs out, troops desert** (slowly, per hour of starving).
- Producer buildings yield more per level, and build times grow gently.
- **Market:** your own trade offers show on the **Buy** tab; **My trades** is a reports-only tab.
- Valorians Plus sells **convenience, never power** (extra builder, extra training slots, crown).

## Look and feel

- No particle or fire effects on the loading screen.
- Medieval/Norse style: Cinzel titles, Alegreya Sans text, `.webp` art in `public/images/`.
- Player-facing text is short and plain. PR titles become release notes for players.
