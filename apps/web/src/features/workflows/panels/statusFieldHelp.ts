// Shared by the Add Status and Edit Status panels so both explain the settings the same way.
export const STATUS_FIELD_HELP = {
  category: 'Groups and colors the status. Automations can match it, but it does not mark work as done.',
  initial: 'New issues start here. Only one status per workflow can be initial.',
  terminal: 'Counts as done for sprints, velocity, dashboards, and epic progress.',
} as const;
