# Recurring tasks

Use recurrence for work that should create a new issue every day, week, or month. Each occurrence is its own issue. Completing one occurrence does not create the next one immediately; the recurrence schedule does that.

## Set a repeat schedule

Open the original issue and find **Recurrence** in the side panel. Choose Daily, Weekly, or Monthly. Set the interval, select weekdays or a day of the month when applicable, and choose when the schedule ends.

Examples include a weekly website review, a monthly content check, or a daily operational task. Put the reusable instructions on the original issue, since future instances copy its work details.

Use a small number of occurrences for the first trial. Check the dates and the first generated issue before relying on the schedule for essential work.

## Understand the new issues

A generated issue copies the original work's summary, description, type, assignee, priority, labels, and other relevant fields. It begins in the project's initial workflow status and links back to the recurrence parent. It does not inherit completed status or start with completed progress.

Dates move with the occurrence. The original issue is the template, so changing one generated instance is not a request to rewrite all future instances. Open the original to change or stop the schedule.

Use the recurrence history/occurrences control to inspect instances that exist. It is not a promise that every future instance has already been created.

## Stop or finish recurrence

Set **Repeat** to **None** on the original issue to stop future generation. Already-created issues remain. A configured end date or occurrence limit also ends the schedule.

“After N occurrences” counts generated child occurrences, not the original template issue. Monthly schedules near the end of a month use the last available day when necessary.

If the next instance is missing, first check the original rule, its end condition, the scheduled processing time, and the server/Redis health. Use [Automations](https://github.com/jakwinkler/weaver/wiki/Automations) for scheduled updates to existing issues.

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

`recurrenceRule` is a nullable issue field with `frequency`, integer `interval`, optional `daysOfWeek` (0 for Sunday through 6 for Saturday), optional `dayOfMonth`, and optional `endDate` or `maxOccurrences`. Intervals are 1 to 365; maximum occurrences are 1 to 1000.

`GET /issues/:issueKey/recurrence` reads the chain. Setting `recurrenceRule: null` on the root stops further generation. Child issues carry `recurrenceParentId` and an occurrence number, with uniqueness protecting against duplicate creation.

The API starts a BullMQ consumer for `recurring-tasks` and registers `0 0 * * *`. Recurrence date arithmetic uses UTC dates. Keep server scheduling/timezone behavior consistent and verify the installed runtime's actual job timing. The documentation walkthrough verified rule storage and the recurrence UI; it did not wait for an overnight scheduled run.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/web/src/components/RecurrencePicker.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/components/RecurrencePicker.tsx)
- [apps/api/src/modules/issues/recurrence.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/issues/recurrence.service.ts)
- [apps/api/src/modules/issues/issues.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/issues/issues.service.ts)
- [packages/shared/src/schemas/index.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/packages/shared/src/schemas/index.ts)
