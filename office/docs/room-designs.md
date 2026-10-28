# Complete rooms and the Hong Kong calendar

The room-design release scope is **six everyday interiors and 27 holiday interiors**. Each new room has its own architecture, furniture positions, usable floor, entrance and activity areas. These are complete spaces; the older seasonal paintings with a shared layout remain separate choices.

## Choosing a room

The scene menu includes **Daily room / 每日新房间**, the new individual rooms and the three original venues. Daily room is the default for new and migrated preferences. Selecting any individual room saves a manual choice; it stays selected through holidays and app restarts. Select Daily room again to resume the calendar.

Ordinary days use a date-seeded shuffle of the six everyday rooms. The choice is stable for the entire Hong Kong date and across restarts. Each six-day calendar block uses every everyday room once, and adjacent ordinary calendar slots never repeat. Holiday dates take priority over those slots, so a holiday does not start a new shuffle or reset the sequence. This is a reproducible local schedule, without a network request or a new random choice on every launch.

The calendar uses **Asia/Hong_Kong**, regardless of the Mac's time zone. It re-evaluates while the window is visible and when the app resumes. A room change waits for current walks, entrances, exits and finite clone transitions to settle. After the incoming image decodes and the complete observed cast fits, the image and its floor geometry commit together. A failed decode or fit leaves the previous room available. Different floor plans do not crossfade over agents standing on incompatible furniture.

The same real actor bodies, session IDs, parent relationships, names and accumulated work animations continue in the new room. Room changes arrange their positions on the new floor; they do not create AI events, replay task success or trigger a new work-arrival response. The saved Agent size remains an upper limit, and all observed identities participate in the fit.

The current presentation makes helpers compact: their internal body ratio is 80%, and an additional 82% helper button frame scales both body and label. Their visible body is therefore about 65.6% of a main at the same common cast scale. Layout measures the actual main and helper envelopes separately. The fitter first seeks seats near the chosen size, then permits neighbouring activity floor before shrinking further. Runtime walking allows up to eight concurrent routes and transient crossings between agents; furniture and reserved clock geometry remain obstacles, while settled destinations are separate.

## Everyday architecture

- **Rain Courtyard / 听雨庭院**: an asymmetric timber courtyard with shoji walls, slate and low worktables.
- **Orbital Bridge / 环星舰桥**: a curved pressure hull, panoramic planet window and hexagonal mission island.
- **Grand Library / 鎏金大书房**: an Art Deco vaulted salon with emerald mezzanines, an angled reading table and writing carrels.
- **Sunlit Glasshouse / 日光温室**: a cast-iron conservatory with a specimen island and curved workbar.
- **Coastal Atelier / 蔚蓝海岸画室**: a limewashed loggia with cobalt work surfaces and a freestanding drawing table.
- **Undersea Laboratory / 深蓝海底实验室**: a circular underwater habitat with oval windows, a computer island and laboratory peninsula.

## Holiday selection

The 27 occasion identities in `lib/room-calendar.js` define the full holiday room scope. The rules below describe automatic room selection, rather than a claim that every occasion is a Hong Kong public holiday.

1. **New Year**: January 1–3.
2. **Lunar New Year**: Chinese lunar month 1, days 1–3, plus the explicitly listed Hong Kong substitute holiday.
3. **Lantern Festival**: lunar month 1, day 15.
4. **Valentine's Day**: February 14.
5. **Holi**: the published regional date for a supported year.
6. **St Patrick's Day**: March 17.
7. **Carnival**: Shrove Tuesday, 47 days before Gregorian Easter Sunday.
8. **Easter**: Good Friday through Easter Monday, plus an explicitly listed Hong Kong substitute holiday.
9. **Qingming**: the published Hong Kong solar-term date, plus an explicitly listed substitute holiday.
10. **Songkran**: April 13–15.
11. **World Book and Copyright Day**: April 23.
12. **Labour Day**: May 1.
13. **Buddha's Birthday**: lunar month 4, day 8, plus an explicitly listed Hong Kong substitute holiday.
14. **Dragon Boat Festival**: lunar month 5, day 5.
15. **Midsummer**: the Friday between June 19 and 25 and the following Saturday.
16. **Hong Kong SAR Establishment Day**: July 1.
17. **Tanabata**: July 7.
18. **Mid-Autumn Festival**: lunar month 8, days 14–16.
19. **Oktoberfest**: the published Munich opening date for a supported year.
20. **National Day**: October 1.
21. **Chung Yeung Festival**: lunar month 9, day 9, plus an explicitly listed Hong Kong substitute holiday.
22. **Halloween**: October 31.
23. **Day of the Dead**: November 1–2.
24. **Diwali**: the published regional date for a supported year.
25. **Loy Krathong**: the published Thai date for a supported year.
26. **Thanksgiving**: the fourth Thursday in November, using the United States convention.
27. **Christmas**: December 24–26, plus an explicitly listed Hong Kong substitute holiday.

When dates overlap, only one room can be automatic. Explicit Hong Kong substitutes take priority, followed by the lunar festivals, Qingming, fixed-date occasions and the remaining calculated or year-specific dates in resolver order. Every complete room remains manually selectable, including occasions that lose an overlap.

Moving regional dates are deliberately bounded. Holi, Diwali and Oktoberfest currently have explicit dates for **2026 and 2027**; Loy Krathong has an explicit **2026** date. Unknown years do not borrow an earlier year's date. Qingming's published table covers **2026–2035**. Hong Kong substitute dates are explicitly recorded for **2026 and 2027**, not inferred for later years. Lunar festivals use the existing Chinese-calendar conversion in `festival-model.js`; Easter uses Gregorian computus. The calendar's `SOURCES` registry preserves the Hong Kong Government, Hong Kong Observatory and relevant official regional references used for the rules and supported dates.

## Artwork and geometry sources

The complete room paintings are original assets generated from scratch with the built-in image tool. Selected PNGs and their exact generation prompts, source basenames, dimensions and SHA-256 hashes are in `assets/scenes/rooms/` and its `generation.json`. Generation does not use restored character artwork or the upstream application icon.

Holiday furniture and route profiles are authored in `design/room-profiles/*.json`; `scripts/sync-room-designs.cjs` compiles them into the local browser module `lib/room-holiday-designs.js`. Everyday profiles are authored in `lib/room-designs.js`. Each profile describes six furniture roles, nine adjacent activity areas, its own entry and floor, and conservative furniture obstacles. Geometry is reviewed against the selected painting, since generated furniture may differ from prompt coordinates. No runtime AI generation or remote artwork service is involved.

From the repository root:

```sh
# Validate profiles, selected assets and the exact generated browser catalog.
npm --prefix office run check:rooms

# Recompile the catalog after deliberately editing a holiday profile.
npm --prefix office run sync:rooms

# Run the full portable regression suite; pretest checks catalog synchronization.
npm --prefix office test

# Audit the production page's complete room catalog in Electron.
office/node_modules/.bin/electron office/test/room-designs-renderer.cjs
```

`check:rooms`, the pretest gate and the room checks before builds use `--check`; they do not rewrite profiles or the generated catalog. Builds continue through the existing provider/native preparation only after the room catalog is synchronized. The bundle verifier requires each catalog painting, the calendar/catalog modules, room CSS and provenance manifest and compares their packaged bytes with the source.

Portable room tests check original artwork hashes, distinct furniture maps, each work area's entrance connection, settings persistence and complete casts through 100 identities. The production-page native fixture checks room/art geometry agreement, full actor envelopes, identities, retained body and work-animation owners, and reduced motion. Synthetic fixtures do not certify a live provider session or establish that names remain readable in an arbitrarily crowded room.

The [public room gallery](../../docs/rooms/README.md) references the same original paintings and offers furniture, activity-area and entrance-route overlays. Its two original capsule markers use synthetic identities and production geometry, without loading restored avatar files. Export it with `node office/scripts/render-room-gallery.cjs` from the repository root; `--check` verifies exact HTML/manifest bytes against source and artwork hashes without rewriting them. The exporter requires all 33 interiors and does not duplicate the PNGs as screenshots.

## Original venues and seasonal studies

Workshop, Teahouse and Observatory remain manual choices. Their seasonal themes, mechanisms, weather controls and public galleries retain their own behavior and shared geometry. The 43 earlier seasonal workshop paintings are additional artwork variations, not 43 distinct floor plans. New complete rooms suppress the old architectural overlays and place the reused decorative mechanisms relative to their own furniture. Reduced motion and low-power settings continue to govern decorative movement; the Hong Kong clock and observation facts retain their existing meanings.
