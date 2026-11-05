# Game design decisions

The owner's decisions about how Valorians Legend should play. When code and this file disagree,
ask before "fixing" either. Add new decisions here when they are made.

## Vocabulary

- **Tribe / village** — the player's home. **Build** page = `/tribe`. **War** page = `/battle`.
- **City Gate** — the wall building. **Hideout** — protects some resources from raiders.
- **Camp** — a barbarian camp (PvE). **Lair** — a bandit lair near villages.
- **Regiment** — all troops of one type; they share XP and rank.

## Buildings and village

- Buildings have a **top level** (Nov 2026, owner's call; before that there was none): 20 for most, Barracks and Siege Workshop 5, Stable and Dragon Roost 10, Academy 10, Exploration Center 1. Saves above the top were brought down and refunded at today's prices, up to a full warehouse.
- **Unlock tree** (`BUILDING_REQUIRES`): buildings need others before their first level
  (Stable: Barracks 3 + Town Hall 5; Dragon Roost: Town Hall 20, Stable 10, Siege Workshop 5…).
  Only the first level checks it; buildings already standing keep growing.
- **Mastery stars:** a building at its top can earn 5 stars, each costing its last level's
  price and taking longer; a star is half a level of effect (Arsenal 40% → 45% at 5 stars).
  Stars count only while the building stands at its top. Unlock buildings and the Town Hall
  have none.
- **Queue controls:** cancel any job (full refund in the first minute, 80% after); finish the
  last 5 minutes for free (15 with Plus).
- **No building can be higher than the Town Hall**; producers and the Warehouse may be 2 levels ahead. Town Hall gives a builder at 10 and 20 (max 3, +1 with Plus) and up to 50% faster building.
- Cost grows gently to level 15, then steeply (×1.8 a level): levels 16–20 are the late game, so maxing a village takes months. Effects have readable tops (Arsenal/Armory +40%, City Gate +60%).
- Each building costs a **different mix of resources** by what it is made of (City Gate: brick, then iron, then wood, a little crop; Harbor: mostly wood). The total per level is unchanged; only the split differs (`BUILDING_MIX` in config.ts).
- The **Build page is the list only**. The village picture lives on the **War map**:
  zooming in on your own tribe shows its buildings.
- The village uses a **natural layout**, not a tidy grid of rows.
- The **wall's look upgrades with City Gate level** (wood, then stone, and onward without end).
- Wall art comes from **Gemini-generated sprite sheets** the owner makes — don't hand-draw walls.
  Dragon art also comes from the owner's Gemini images.
- The Hall shows **urgent alerts on top**, then short next steps. Name and rank live in the top bar only; the banner carries Town Hall level, power, people, clan, shield, Plus and the stores. Below the steps: everything on a clock (builds, training, armies coming home, outpost fields) and the army at home. No "Places" grid: the navbar and Trade button already go there.

## War

- A **won raid knocks the City Gate down some levels**, even when the tribe is empty.
- The **Hospital saves only wounded troops, never the killed**.
- **Trapmaker catches attackers** before the battle (it does not just add defense).
- **A village fights one attacker at a time.** An army that arrives while it is fighting waits at
  the gates and attacks when the field is clear, against all defenders home by then (so a small
  bait wave can't pull the defenders out for the main army behind it).
- **An army coming home to a village under attack joins the fight** from the next round (the
  round under way is fought out as it was). The rest of the battle is decided again with them;
  rounds already fought never change. Ships and carried loot go home. Arriving after the last
  round has begun is too late: they wait at home for the result.
- **Hideout** protection is capped.
- **Raid shield grows** when a player is raided again and again.
- **A raid shield is earned by real damage** (Nov 2026), not by being attacked: damage = loot +
  cost of defenders killed, over lootable stores + cost of defenders (never less than 12 h of the
  tribe's own production). Under 5% no shield; it scales up to the full 2/6/12 h ladder step at
  25%; all raid shields in a day add up to at most 24 h. Stops a player attacking their own second
  account with a few troops (and losing on purpose) to hand it a free shield. Pinned in
  war.test.ts ("attacking your own second account…"). Numbers: `RAID_SHIELD` in config.ts.
- Attacking a **much weaker target gives half loot**.
- Knight and Paladin are strong elite cavalry.
- **Every troop has one job** (Nov 2026 rebalance, pinned by "each troop is the best at its own
  job" in war.test.ts): Spearman cheapest defense and anti-cavalry, Archer anti-foot-soldier
  and anti-dragon defender, Swordsman all-rounder, Axeman most attack per crop, Light Cavalry the
  fast raider with the biggest carry, Paladin most defense per crop, Knight most attack per
  resource and per training second. Spearmen defend +50% against horsemen, Archers +50%
  against foot soldiers: attackers mix, defenders mix.
- **Siege breaks levels, not shares:** 10 rams break one City Gate level, 8 catapults one
  Watchtower level, so a bigger wall needs more rams. The dragon's fire breaks half of both at
  any level.
- **Militia** (free defense from population) stops at 2,000.
- **Attacks on players take at least 5 minutes** to arrive (camps and lairs don't), so the
  "under attack" message comes in time to react. Tribes settle 4 tiles apart; neighbours'
  cavalry used to arrive in 40 s.
- **Ranks come slowly.** Battle XP grows with the enemy's strength to the power 0.65, so
  big late battles don't hand out ranks: Legend comes around camps 25–30. A repeat raid on a
  beaten camp gives 30% of the XP.
- **Soldiers come from your people.** Training a troop takes one person per crop it eats
  (Spearman 1, Knight 3; the dragon none); cancelling gives them back. The population shown and
  ranked is everyone (people at home + soldiers), so training costs no rank but losing an army
  does. Clan minimum population counts everyone too.
- **Experience lives in the soldiers.** Each troop type keeps one rank (no split ranks). When
  troops die, the regiment loses that same share of its XP; if the whole regiment dies, its XP
  is gone. Survivors keep theirs, and new recruits join the regiment's current rank.
- **Dragon:** one per player, very expensive, flies straight to the target, **carries no loot**.
  It **never dies**, so losses never cost it XP: instead each **lost battle costs it 20% of its XP**
  and it earns none from a defeat (owner's call, Nov 2026), so its rank can drop (`DRAGON.defeatXpLoss`).
- **Bandit raids** hit villages from nearby lairs, with an **advance warning** and a chance to
  clear the lair first.
- **Barbarian camps are endless** (no level-30 cap) and have **names, not numbers**.
  Rewards past level 30 were too high; they now grow gently while camps keep getting tougher.

## Clans

- **Clan level:** techs climb 5 levels per clan level. When **every** tech reaches the cap, the
  clan levels up and the cap rises by 5 (5, 10, 15, …). **No top level for now**: costs grow
  fast, so keeping all techs raised is the hard part.
- **Clan perks have a top** (Nov 2026): Shared Fields, War Banners and Shield Wall stop adding
  past tech level 15 (+45% production, +30% attack, +30% defense). Clan levels and the Great
  Hall still have no top.
- **Clan aid limits** (against alt accounts): a member gets aid only after 3 days in the clan,
  and at most one day of their own output of that resource (or coins) per day, from any clan.
- **Clans fight together** (Nov 2026, owner's call: a war band, not a savings account; rules in
  `CLAN_WAR`, code in `src/lib/game/clanWar.ts` and `src/server/clanWar.ts`):
  - **Guards (reinforcements):** a member sends troops to stand guard in a clanmate's village.
    They fight in its battles under its banner (its walls, ranks, bonuses), lose the same share
    as the village's own troops, and **the village feeds them** (as in Travian). They still count
    in their owner's power and people, never the host's, and the host can't send them anywhere.
    The owner calls them home, or the host sends them home, any time except mid-battle. Leaving
    the clan ends every guard duty. No dragon (it guards only its Roost); ships sail along across
    the sea. Up to 3 groups out per tribe, 5 guests per village.
  - **Attack alerts:** when a member is attacked, every clanmate is told (bot + in-game), once
    per attacked tribe per 10 minutes, with a "Send help" button.
  - **Clan strikes (rallies):** the Jarl or a Huscarl names a tribe and a landing time (10 min to
    24 h ahead, never onto a shield). An army joining far ahead **waits at home** (still defending)
    and sets out just in time (`CLAN_WAR.musterLeadMs` early, slowing to land on the minute), so
    the target is warned only the usual travel time before (Nov 2026: setting out at once gave
    hours to buy a shield). A late army lands when it can. Waves queue at the gates (one battle
    at a time).
- **Shields vs armies on the road** (Nov 2026, owner's call): a shield bought or claimed **after**
  an army set out (or after its clan strike was called) doesn't stop it; it stops attacks sent
  after it goes up (`shieldStops`). Shields already up (a new tribe's, an earlier one) and raid
  shields earned from a real hit still turn armies back. The Shield sheet warns how many armies
  are already marching.
  - **Diplomacy:** alliances and non-aggression pacts (both clans agree) block raids between
    their members; a war is declared by one clan, scores every raid won between the two, and
    ends with peace (both agree) or by itself after a week. Up to 5 treaties per clan.
    Officers find the other clan by searching (name or tag) in the War tab, or act from any
    clan's page, which also shows how the two clans stand; nobody has to know a tag by heart.
  - **Weekly goal:** one shared goal a week (camps cleared, raids won, or treasury donations,
    rotating), sized by the number of members; met, every member gets 3,000 coins. The War tab
    shows who did what this week.
  - **Small things:** a clan can link its Telegram group (t.me only); villages of allied and
    warring clans get their own colours on the map; the season's 2nd and 3rd Wonders get
    40,000 / 20,000 coins per member.
- **A clan needs at least 2 members.** A chief alone can found one, but it is *forming*: its
  techs give no perks and can't be raised until a second chief joins (and stop again if it
  drops back to one).

## Outposts (lighter second villages)

- **Outposts** are new places on the map: Town Hall 10, 15 and 20 each allow one. Founding
  costs resources (40k of each, doubling each time) and settlers from the population
  (500, 1,000, 1,500). The player **chooses the land**: free dry tiles 5–10 tiles from home and
  at least 4 from any other village (outside its walls, which reach ~3 tiles); where a crowded
  corner leaves nothing in that ring, the search widens up to 16 tiles, so a tribe that can pay
  always has land. The best land for each resource is offered.
- **Land bonus:** the land round an outpost (its tile and the 8 next to it) favours one resource:
  woods wood, hills clay, peaks iron, open fields and water crop. +10% to that field per tile of
  it, up to +40%. Even three outposts all on the same resource stay under a top village (~0.83).
- Each outpost has **its own four resource fields (to level 10) and its own builder**, and sends
  everything home. Three full outposts add about half a top village's output.
- **Not full villages, on purpose:** no buildings, army or storage of their own, and they
  can't be attacked (yet). A whole second village would have meant a second copy of every
  system; outposts give the late game its expansion without that risk.

## Seasons and the World Wonder

- **The server-wide end goal.** Clans (clan level 2+, at least 2 members) raise a World Wonder
  from the treasury: 20 levels, each dearer than the last (~69M of each resource in all), with a
  12-hour wait between levels, so at least 10 days for any clan. The first clan to finish wins
  the season: each member gets 100,000 coins and a crown badge, then every Wonder falls and a
  new season starts.
- **A season is a race, not a wipe:** villages, armies, clans and techs are kept. Only Wonders reset.
- Past winners and the leading Wonders show on the clan screen (`seasons` table).

## Economy

- When **crop runs out, troops desert** (slowly, per hour of starving).
- Producer buildings yield more per level, and build times grow gently.
- **Game physics are tested** (`physics.test.ts`): time (one jump = many steps), nothing
  negative or NaN, production never past the warehouse, training/cancel conserve resources and
  people, battle losses bounded, loot bounded, more troops never worse, junk input refused,
  and 6,000 random actions keep every law. A failure there is a bug, not a balance change.
- **Pacing is tested** (`balance.test.ts`): a perfect builder reaches Town Hall 10 in about two
  weeks and finishes the village in about four months; an army comes from the resources that
  pile up while the village waits for others. Change the economy → those tests tell you the
  new pace.
- **Merchant of the North:** with a Trading Post, swap one resource for another at once at
  60% (one merchant's load at a time). The player market stays the better price.
- **Leaderboard ranks by power** by default (tabs for population and victories), the bot's
  Top chiefs too, and clans rank by their members' total power. Population grows with time
  played; power with what a tribe built and kept.
- **Embassy stays the population building**: since soldiers are recruited from people, more
  people per hour means more recruits.
- **Pace:** about 4 months to finish a village with perfect play is the target (owner's call,
  Nov 2026); `balance.test.ts` holds it.
- **Market:** your own trade offers show on the **Buy** tab; **My trades** is a reports-only tab.
- Valorians Plus sells **convenience, never power** (extra builder, extra training slots, crown).

## Look and feel

- No particle or fire effects on the loading screen.
- Medieval/Norse style: Cinzel titles, Alegreya Sans text, `.webp` art in `public/images/`.
- Player-facing text is short and plain. PR titles become release notes for players.
