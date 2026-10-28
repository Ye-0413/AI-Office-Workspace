# Complete room gallery

[Open the local interactive gallery](index.html). Download or clone the repository and open `docs/rooms/index.html` in a browser; its images reference the original PNG files already in `office/assets/scenes/rooms/`. No server, account, network connection or restored character artwork is needed.

The release gallery contains **six everyday rooms and all 27 holiday rooms**. Each card shows the whole architecture, with two original capsule markers fitted on the room's actual floor. Click a painting to inspect it at a larger size. Search English or Chinese names, filter everyday or holiday rooms, and switch the labels between English and Chinese.

The optional layers expose different parts of the layout:

- **Furniture map** shows furniture bounds, the actual collision rectangles, the usable floor boundary and the clock reservation.
- **Activity areas** shows the nine furniture-side activity domains in different colors.
- **Entrance routes** shows model-computed routes from this room's entrance to the two synthetic standing positions.
- **Preview markers** shows a reading main identity and its planning helper. Their original SVG capsule drawings contain no upstream avatar content. Helper body and frame scales follow the current production policy, including its smaller label frame.

This is a static design and geometry review. It does not replay observed AI activity, demonstrate avatar choreography, certify live providers or establish readable names in an arbitrarily crowded room. The separate local production-page native test verifies real actor continuity and full casts without publishing private captures.

To rebuild and verify from the repository root:

```sh
node office/scripts/render-room-gallery.cjs
node office/scripts/render-room-gallery.cjs --check
```

The exporter refuses an incomplete release catalog, verifies selected PNG dimensions and SHA-256 hashes against generation provenance, checks synchronized holiday profiles, and fits both synthetic identities through the production scene and walking models. It writes only `index.html` and `manifest.json`; it does not copy the original PNGs or create screenshot duplicates. The manifest binds every original painting, each room's geometry, authored holiday profiles, relevant production modules and exporter source. `--check` reproduces those artifacts in memory and compares exact bytes without writing.

Calendar rules, supported date ranges and artwork provenance are explained in the [room design guide](../../office/docs/room-designs.md).
