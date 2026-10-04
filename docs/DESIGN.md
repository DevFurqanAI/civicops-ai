# CivicOps visual system

Light product interface for citizen services and daily operational review. Keep
existing Tailwind/React/Lucide dependencies and real service contracts.

## Colors

Canvas #f3f6f8, surface #ffffff, ink #15364a, body #344f61, muted #587080,
line #d6e1e7. Primary teal #146b68, hover #0f5351, selected #e9f4f2.
Semantic red is critical/error, amber is warning/high priority, green is resolved
or successfully completed. Text labels carry meaning alongside color.
Primary body/muted/placeholder/button/state contrast pairs meet WCAG AA.

## Typography and shape

Native Segoe UI/system sans, 15px base. Main service heading 40px desktop/32px
mobile; compact operations heading 30px. Product labels and controls 13-15px.
12px panels, 8px controls, compact 5px status tags. No decorative shadows or
hero gradients. 160ms color transitions; reduced-motion override.

## Composition

Citizen: full-width introduction, roughly 60/40 report/guidance desktop split,
single-column mobile, description/location/evidence in that order. Language
selection is visible in the form header; Urdu form direction is RTL.
Operations: compact summary strip, queue and intelligence columns. Queue remains
visible while reviewing details. Map is a short supporting panel below queue.
Rows show priority/title/summary/category/report count/location/status/department
and actual update time. Active/all scope is a local view filter only.
Tracking: overview/evidence/eligible feedback beside actual status-history panel.

## Truthfulness and accessibility

AI summary and response-plan recommendation are distinguished from current human
operational decisions. Render supporting signal details as supplied. Matching
rationale and location confidence are not currently exposed by the incident API;
do not fabricate them. Timestamp labels explicitly say Updated.
Use native buttons, associated labels, visible focus, skip links, semantic headings,
ARIA feedback and deliberate empty states. Auth/media/operational handlers and API
field contracts are unchanged. Full auxiliary-copy translation remains incomplete.

Browser automation is blocked by missing sandboxPolicy runtime metadata; desktop,
mobile, keyboard and Urdu-layout visual acceptance still require a local browser.
