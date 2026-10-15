# Weaver documentation

Read the [published documentation](https://github.com/jakwinkler/weaver/wiki) or start with the [local documentation home](wiki/Home.md).

The invited-client guide stays nontechnical. Other feature guides explain everyday workflows first, then mark a **Technical reference (developers and LLMs)** section for API contracts, implementation details, and operational limits. Screenshots use a fictional local workspace.

The original feature walkthrough describes main at `1b1b370`, checked September 23, 2026. Selected guides for invited clients, access, issues/comments, boards, automations, sprints, imports, API keys, audit, plugins, and sign-in/deployment paths were updated against pilot release `ce5494a` on October 15, 2026. Follow each page's revision notes for exact behavior. [Feature coverage](wiki/Feature-Coverage.md) maps all 29 roadmap items and records the later pilot checks separately.

- [Use Weaver as an invited client](wiki/For-Invited-Clients.md)
- [Inline help implementation and verification](client-inline-help-plan.md)
- [Start a project](wiki/Getting-Started.md)
- [Work with issues](wiki/Working-with-Issues.md)
- [Plan sprints](wiki/Sprints-and-Reports.md)
- [Run Weaver](wiki/Self-Hosting.md)
- [Build a plugin](wiki/Plugin-Development.md)
- [Troubleshoot](wiki/Troubleshooting.md)

## Documentation maintenance

The invited-client guide and creation instructions now include the local inline help implementation on top of `ce5494a`: Description during creation, optional-field tooltips, visible description actions, and help inside the app. Its screenshots use new disposable client accounts. These additions have local verification evidence in the implementation record; they require the frontend update before they match a deployed installation.

`docs/wiki` contains the GitHub wiki mirror and local draft changes, including its sidebar, footer, and screenshots. The published wiki may lag this directory until the draft is reviewed and published. Keep page filenames stable because they form the wiki URLs. Most page links use published wiki URLs so they work on both GitHub surfaces.

Before publishing an update, check the current source and relevant behavior, update the source baseline and verification notes, inspect screenshots for fictional data and readable content, and validate links and image paths. Publish only the reviewed documentation files to `jakwinkler/weaver.wiki.git`; application commits and deployment are separate actions.

`docs/roadmap` remains planning history. Its proposed milestones and checkboxes are not current product instructions or release acceptance evidence. Existing plugin and architecture documents remain available for deeper background; the wiki links to exact source revisions where older examples differ from current behavior.
