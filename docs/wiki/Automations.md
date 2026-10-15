# Automations and scheduled rules

An automation runs actions when an event happens or a schedule is due. Start with one narrow project rule, check the result, and expand it only when the behavior is clear. You need an owner/admin account to manage automation rules.

## Create a rule

Open **Administration → Automations**, then **New rule**. The builder has four steps:

| Step | Decide |
| --- | --- |
| Trigger | What starts the rule, its name, and its project or global scope |
| Conditions | Which issues qualify; every condition must match |
| Actions | What happens, in the order you arrange |
| Review | Whether the complete rule says what you intended |

A simple starting rule is **Label new website work**: scope it to Website Launch, trigger on **Issue created**, use no conditions, and add the label `triage`. Save it, create one test issue, and confirm that issue has the label.

![Automation review showing the project, trigger, conditions, and action](https://raw.githubusercontent.com/wiki/jakwinkler/weaver/images/automation.png)

*The review screen makes the rule's scope and ordered actions visible before it is saved.*

## Choose the trigger and conditions

Event triggers cover issue creation, updates, transitions, assignment, comments, and sprint start/completion. For **Issue updated**, you can restrict the trigger to a particular changed field.

Conditions can match fields, detect empty values, compare status categories or issue types, and check whether a value contains something. With scheduled rules, date comparisons can find work before or after a date or the current time.

No conditions means the rule has no additional filter. A global rule without conditions can affect much more work than a project rule. Sprint events do not automatically provide an individual issue for every issue action; test the intended combination before relying on it.

## Choose and order actions

Actions can set an issue field, transition it, add a label, add a comment, send an in-app notification, or call a webhook. Drag actions or use the move controls to change their order.

Earlier actions can succeed before a later action fails. Do not assume the entire rule is rolled back as a single transaction. A repeated notification, comment, or webhook can have an external or visible effect, so check execution history before retrying.

## Schedule work

Choose one of the named schedules, or **Custom cron schedule**. The named options include daily at 09:00 UTC, Monday at 09:00 UTC, hourly, and every 15 minutes. Custom cron uses five fields: minute, hour, day of month, month, and day of week.

All automation schedules and previews use **UTC**. Convert your desired local time and account for daylight-saving changes yourself. For example, `0 9 * * 1-5` means 09:00 UTC on weekdays, not 09:00 in each user's timezone.

**Run now** queues a scheduled rule for real execution. It is not a dry run. Use a disposable project or a carefully limited condition when testing.

A scheduled run stops with an error if its conditions match more than 100 issues. Narrow the rule and run it again after checking execution history.

## Check and maintain a rule

After a test, open the rule's execution history and inspect the result and any error. Disable a rule to pause future processing while you revise it. Confirm already-queued work separately. Use [Recurring Tasks](https://github.com/jakwinkler/weaver/wiki/Recurring-Tasks) when the goal is to create repeated task instances rather than act on a set of matching issues.

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

The admin API uses `/automations`, `/automations/:id`, `/automations/:id/executions`, and `POST /automations/:id/run`. A run request returns acceptance/queued state, not completion. Run-now is for enabled scheduled rules.

The engine enqueues event work, evaluates all conditions, and executes actions sequentially. It bounds automation chains at depth 5. Up to 25 actions are accepted per rule. The service retains the most recent 100 execution records per rule, so this is not an indefinite audit archive.

Scheduled rules register BullMQ schedulers; the worker hands scheduled jobs to the automation queue. The API hosts the automation execution consumer. Redis and the necessary application/worker processes must be healthy. The trigger schema accepts exactly one named schedule or custom cron expression and validates it in UTC.

The pilot engine checks that each queued job's tenant ID matches its schema before running. A scheduled match query reads up to 101 issues so it can reject a result over the 100-issue limit.

A representative rule payload is:

```json
{
  "name": "Label new website work",
  "projectId": "<project UUID>",
  "enabled": true,
  "trigger": { "type": "issue.created" },
  "conditions": [],
  "actions": [{ "type": "add_label", "label": "triage" }]
}
```

The UUID placeholder must be replaced before submitting the example. Use the schema and action executor when extending fields; the UI exposes a smaller curated field list than the underlying API contract.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/web/src/features/admin/RuleBuilder.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/admin/RuleBuilder.tsx)
- [apps/web/src/features/admin/automation-utils.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/admin/automation-utils.ts)
- [apps/api/src/modules/automations/automation.types.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/automations/automation.types.ts)
- [apps/api/src/modules/automations/automation-engine.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/automations/automation-engine.service.ts)
- [apps/api/src/modules/automations/automations.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/automations/automations.service.ts)
- [apps/api/src/modules/automations/automation-scheduler.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/automations/automation-scheduler.service.ts)

Pilot update checked against [`ce5494a`](https://github.com/jakwinkler/weaver/commit/ce5494a445f0a5412cf7e0be378308afbeb5e5f8): [automation engine](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/api/src/modules/automations/automation-engine.service.ts).
