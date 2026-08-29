import { useMemo } from 'react';
import { AutomaticTimeReviewPage } from './AutomaticTimeReviewPage';
import { createAutomaticTimeApi, type PluginApi } from './types';

export function AutomaticTimeReviewPageWrapper({
  pluginContext,
}: {
  pluginContext: { api: PluginApi; currentUserId?: string };
}) {
  const api = useMemo(() => createAutomaticTimeApi(pluginContext.api), [pluginContext.api]);
  return (
    <AutomaticTimeReviewPage
      api={api}
      currentUserId={pluginContext.currentUserId ?? 'interactive-user'}
    />
  );
}
