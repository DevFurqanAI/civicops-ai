# CivicOps AI interface history and current surfaces

Historical redesign record; current product truth is in [design](DESIGN.md), [architecture](ARCHITECTURE.md) and [testing](TESTING.md). Earlier file inventories/test totals are superseded.

The citizen/command-center polish replaced dominant red branding with slate/navy/teal, introduced shared navigation/cards/empty states, widened desktop reporting and removed the primary citizen category selector. Text/location/evidence reporting, real tracking, account/security and API contracts were preserved.

Subsequent Department work added trusted identity/account display, authorized summary counts, filters/search, incident intelligence, private work/history and contextual actions. Both dashboards now share IncidentMap. The current raster provider is MapTiler Streets-v4; public OSM raster use is historical. Map selection, stable viewport/resize behavior and missing-coordinate fallback remain shared.

Recent session behavior deduplicates trusted verification without tab-focus flicker. Location UX explicitly accepts written landmarks without GPS and preserves manual + GPS input independently.

No mock data, fake action success, fabricated history/evidence or new backend behavior is implied by visual styling. Known visual limits include incomplete helper-copy translation, real-browser acceptance and the current large-bundle advisory. There are no committed product screenshots or browser acceptance artifacts.
