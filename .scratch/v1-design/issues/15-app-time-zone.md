# Which time zone decides "today"

Status: resolved
Type: grilling
Blocked by: none

Parked during the V1 data model grilling (2026-10-21). Revisit with `/wayfinder` once the data model is settled.

## Question

Which time zone decides "today" for the app: when a Meal becomes Unconfirmed, when the 07:00 badge appears, when "from Saturday" starts and which week is the current one?

Agreed so far:
- Meal dates are stored as plain calendar dates and hours as plain times, with no time zone, so the data model works with either answer.
- Stock Movement and `created_at` timestamps are stored with a time zone.

Options:
- **One fixed app time zone** (from configuration, e.g. `TZ`): every device agrees on "today", but while travelling the 07:00 badge and day boundaries follow the home time zone, not local time.
- **Each device's own time zone**: 07:00 is always local, which matches when people actually eat, but two people using the app from different time zones could disagree about whether a Meal is Unconfirmed yet.

Open:
- How likely is a household with several app users in different time zones at the same time?
- Is there a middle ground, e.g. per-device time zone for display and reminders, but a household time zone for the Monday resolution screen and week boundaries?

## Answer

Resolved 2026-10-21.

- One **Household Time Zone (HTZ)** for the whole app. Default: the time zone of the first browser that opens the app (not the server's, which is usually UTC in a container), saved once and changeable in Settings.
- Every "what day is it today?" uses the HTZ: Unconfirmed, the 07:00 badge, the Saturday banner and Monday screen, the current week and today's highlight, Suggestions' days-until-Meal, red/amber Shortfall warnings, and Meal Series ("today or later", "through next Sunday").
- Meal dates and hours are plain values and never change with the HTZ; changing it only moves "today".
