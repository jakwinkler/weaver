# Jam plugin test guide

This guide is for the first human test of the Jam plugin: Jam bug reports arriving in Weaver, becoming issues, linking back, and recordings requested from issues. It covers plugin version 0.2.0 on `feature/plugin-sdk-integration-prereqs`. The design and its limits are in [30-jam-plugin.md](30-jam-plugin.md).

Report problems to [TK: where testers should report]. For each one, say what you did, what you expected, and what happened. A Jam of the problem is ideal.

## Setup (an administrator does this once)

The Weaver you test against must run this branch at a public HTTPS address. Jam does not deliver webhooks to `localhost` or to plain `http`. The API needs `API_PUBLIC_URL` set to its public address and `WEB_URL` set to the web app's address. In production the API loads only plugins listed in `WEAVER_TRUSTED_PLUGINS`, so that list must include `@weaver/plugin-jam`; it is empty in the production overlay and the compose example today. Before anything else, open **Administration > Plugins** and check that Jam is listed.

1. **Install the plugin.** In **Administration > Plugins**, install Jam. It installs disabled, so enable it afterwards.
2. **Create a Jam token.** In Jam, open the workspace menu, then **Settings > MCP > Personal access token > Create Key**. Choose the `mcp:read` and `mcp:write` scopes and an expiry, and note the expiry date. Comments the plugin posts on Jams appear as the person who owns this token.
3. **Find the workspace ID.** It is in the address of any Jam settings page: `jam.dev/s/<workspace ID>/settings`.
4. **Pick a reusable recording link.** In Jam, create a reusable recording link (or use an existing one) and copy its address, such as `https://recorder.jam.dev/AbC123x`. Weaver adds a signed reference to it for each request.
5. **Fill in the plugin settings.** In **Administration > Plugins**, open Jam's settings and enter the workspace ID, the token, its expiry date as `YYYY-MM-DD`, and the recording link. For this test, also turn on **Embed the Jam player** and **Comment on Jams when issues are resolved**. Leave the rest as they are.
6. **Connect the webhook.** In Weaver, open **Apps > Jam > Connection** and copy the webhook URL. In Jam, open **Settings > Webhooks > Set up**, choose **Add Endpoint**, paste the URL, select only `jam.created`, and create it. Copy the endpoint's signing secret (it starts with `whsec_`) into the plugin's **Webhook signing secret** setting.
7. **Verify.** Back on **Apps > Jam > Connection**, choose **Verify connection**. Every status row except **Last webhook** should show a green check. **Last webhook** turns green after the first Jam arrives, and **Access token** stays amber while the token expires within 14 days.
8. **Give testers access.** In **Administration > Roles & Permissions**, give testers' roles **View Jams**, **Link Jams**, and **Triage Jams**. Keep **Administer Jam** for whoever manages the connection and rules. Testers also need membership in at least one test project.

## What to try

Work through these in order. Each step says what should happen.

1. **A new Jam reaches the inbox.** Capture a Jam with the Jam extension on any page. Within a few seconds it appears in **Apps > Jam > Inbox** with its title, type, page, reporter, and browser. The spike measured delivery 0.5 to 3.6 seconds after capture.
2. **Create an issue from a Jam.** Choose **Create issue**, pick a project, and optionally change the summary, issue type, priority, and labels. Then check:
   - A notice links to the new issue, and the Jam leaves the inbox.
   - The issue description has a **Jam** section with an **Open in Jam** link, the page it was captured on, the reporter, the browser and screen, and the capture time.
   - The reporter is the person who captured the Jam when they are a member who can create issues in that project. Otherwise it is you.
   - In Jam, the Jam gets a comment: "Tracked in Weaver as KEY: link".
3. **See it on the issue.** Open the issue. The **Jams** section shows the Jam with its thumbnail and "Linked back in Jam".
4. **Read the debug summary.** Choose **Summary** on the issue's Jam. It shows console and network counts, up to five console errors, and up to five failed requests (method, host, path, status, time). Request bodies, headers, and query strings must never appear. Try it on a Jam captured on a page with a console error or a failing request.
   - On a video Jam recorded with the microphone on, the summary also shows **What the reporter said**: each caption with its start time, such as `0:07`, as plain text. Say something with `<b>` or `&` in it while recording; it must show as typed characters, not formatting.
   - A video Jam recorded with the microphone off, a screenshot Jam, and an Instant Replay Jam show "No spoken transcript".
   - Turn off **Show what reporters said** in the plugin settings and open the summary again (reload the issue first). The transcript section is gone, and the rest of the summary still shows.
5. **Play the recording in Weaver.** Choose **Play** on a video Jam. Jam's player appears inside the issue. It works only for Jams shared with anyone who has the link.
6. **Request a recording.** On an issue, under **Recording requests**, choose **Request a recording**, keep or change the title, and choose **Create and copy link**. Open the copied link in a browser where you are signed out of Jam (or send it to a colleague), record a few seconds in the tab the link opened, and submit. Within a few seconds:
   - The new Jam appears in the issue's **Jams** section as "Recorded for a request", not in the inbox.
   - The issue gets a comment from you saying a Jam was recorded, with the recorder's comment if they left one.
   - The request shows "1 received".
7. **Revoke a request.** Choose **Revoke**, then record through the old link again. The Jam goes to the inbox with "Recorded through a revoked request".
8. **Add routing rules.** In **Apps > Jam > Rules** (administrators only):
   - Add a rule that creates issues for page hosts you can capture on, such as `example.com, *.example.com`, in a test project with a priority and a label. Capture a Jam on that site: an issue is created right away with that priority and label.
   - Add a second rule that suggests a different project for another host. A matching Jam waits in the inbox showing "Suggested project", and **Create issue** starts with that project chosen.
   - Add a **Path starts with** condition, such as `/checkout`, and check that only Jams captured under that path match.
   - Try to add the same host to a rule for a different project. It is refused with the name of the rule that already has it, unless the two rules use different paths.
   - Reorder the rules and check that the first matching rule wins. Turn a rule off and check that it no longer applies.
9. **Resolve an issue.** Move an issue with a linked Jam to a done status. Within a few seconds, the Jam gets a comment saying the issue was resolved, mentioning whoever captured it.
10. **Attach a Jam to an existing issue.** From the inbox, choose **Attach** and enter an issue key. Or, on an issue, paste a Jam link into the **Jams** section and choose **Attach**. A link to a Jam Weaver has never received also works; Weaver fetches it from Jam. A Jam from a different Jam workspace is refused.
11. **Unlink.** Choose **Unlink** on an issue's Jam. If no other issue links it, the Jam returns to the inbox. If Weaver had posted "Tracked in Weaver as KEY" on the Jam, the Jam gets a second comment: "No longer tracked in Weaver as KEY".
12. **Dismiss and restore.** Dismiss a Jam in the inbox, find it under **Dismissed**, and restore it.
13. **Sync from Jam.** Choose **Sync from Jam** on the inbox. Jams from the last seven days that Weaver missed appear. They have no page or thumbnail; that is expected.
14. **Check access.**
    - Someone who is not a member of a project sees no Jams or requests on that project's issues and cannot attach any.
    - A project viewer sees Jams and summaries but cannot attach, unlink, request, or revoke.
    - Someone without **Administer Jam** sees "Only Jam administrators can see the connection." on the Connection tab, and "Only Jam administrators can manage rules." on the Rules tab.

## Expected limits (not bugs)

- Anyone with **Triage Jams** sees every Jam in the inbox, whatever the project.
- The create-issue form and the rule form have no assignee picker.
- Video is never stored in Weaver. Only the thumbnail and, if turned on, Jam's own player appear.
- The debug summary is fetched with the plugin's token, so anyone who can read the issue sees it, even without a Jam account. It is cached for an hour.
- The reporter's transcript is part of the debug summary, so the same people see it. A long transcript shows only its start, up to 20,000 characters, and one over 1 MB shows "too long to show here". Jam's documentation does not say whether its transcripts involve Google Gemini.
- A rule that creates issues files them as the Jam's author when that person can report in the project, otherwise as whoever last saved the rule.
- If a comment on a Jam fails, it is retried when an administrator chooses **Verify connection** or **Retry Jam comments**, and when the next Jam is linked. It is not retried on a timer.
- A recording request's title and reference travel in the link's address, and Jam's recorder removes them from the address as soon as it loads. If that tab reloads before recording (a manual reload, a restored tab, or a browser restart after granting screen-recording permission), Jam receives neither, and the Jam waits in the inbox instead of attaching to the issue. Attach it from the inbox.
- A recording that arrives while Weaver is unreachable can be replayed from Jam's webhook portal. **Sync from Jam** brings the Jam in but cannot tell which request it answered, so it waits in the inbox.
- Jams that arrive through a recording link have no page URL unless your Jam workspace has a connected domain, so page-host rules do not match them.
- Jam's own list of linked issues does not show Weaver. The comment on the Jam is the link back.
- Thumbnails load from Jam's media host. Anyone who has a thumbnail's address can open it, whatever the Jam's sharing setting.

## Not in this test

- Relinking Jams after a Jira import, and a recording step on intake forms.
- Signing in to Jam per person, and connecting more than one Jam workspace.
- Phone-width layouts. They have not been checked; note anything broken, but don't spend long there.
