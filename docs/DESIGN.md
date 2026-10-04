# CivicOps AI visual system

This guide describes the implemented interface, not a new redesign. Styles live in frontend/src/index.css; legacy App.css starter styles are not imported by App.

## Identity

Canvas #f3f6f8, surface #ffffff, ink #15364a, body #344f61, muted #587080 and line #d6e1e7. Primary teal #146b68, hover #0f5351, selected #e9f4f2. Red indicates critical/error, amber warnings/high priority and green success/resolved. Labels retain meaning beyond color.

System/Segoe UI typography, 15px body; desktop citizen heading 40px with responsive sizing, compact operational heading. Shared 12px panels, compact controls/status tags and 160ms color transitions. Reduced-motion handling, visible focus and skip navigation are implemented; this is not a full accessibility certification.

## Layouts

- Citizen: responsive report/guidance desktop columns, stacked mobile. Description, optional landmark/GPS, optional photo/voice, submit. No primary category selector. Language selector visible; Urdu form RTL. Written location/GPS confirmations are independent.
- Operator: compact summary strip; queue and intelligence panel. Filtered shared map supports queue; detail includes plan review, work history and completion verification.
- Department: trusted department/account header, five queue-derived summaries, prominent shared map, combined local filters/search, incident queue and detail/actions.
- Tracking: actual current status, written location, private evidence/eligible feedback and safe recorded history.
- Accounts: consistent existing signup/login/reset style.

## Shared map behavior

IncidentMap uses Leaflet/React Leaflet and MapTiler Streets-v4 raster tiles, with MapTiler/OpenStreetMap attribution. One map per dashboard, stable tile source, selected-marker emphasis, informative popups and queue/map synchronization.

Department map contains all authorized queue rows; its local list filters do not expand access or remove markers. Operator map follows its filtered queue. Missing key displays configuration fallback. Invalid/null coordinates omit markers and preserve location text/details. Empty mapped datasets and hidden/resized containers are handled without an unnecessary filter-triggered remount.

## Intelligence and human decisions

Separate AI summary and template recommendations from Operator review/approval and Department execution. Display confidence/spam separately; do not imply corroboration. Supporting signals are rendered as supplied. Full matching details, location confidence and assigned time are not exposed by current incident contracts; time labels mean Updated.

Plan approval state is visible. Department pending verification clearly awaits Operator review and has no final-resolution control. Allowed actions come from backend responses. Truthful loading, error, busy, conflict and empty states preserve the working API/security contract.

## Acceptance limits

Verify desktop/tablet/mobile, keyboard navigation, long labels, Urdu input/layout, tiles/selection and all role-specific empty/error states in a real browser. Complete helper-copy translation and independent accessibility/browser acceptance are not established by static component tests. See [testing](TESTING.md).
