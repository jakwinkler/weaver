import { useEffect, useState } from 'react';
import type { PluginComponentContext } from '@weaver/sdk';

interface TemplatePageProps {
  pluginContext: PluginComponentContext;
}

export function TemplatePage({ pluginContext }: TemplatePageProps) {
  const [message, setMessage] = useState('Loading server response...');

  useEffect(() => {
    pluginContext.api
      .get<{ message: string }>('/hello')
      .then((response) => setMessage(response.message))
      .catch(() => setMessage('The template server route is unavailable.'));
  }, [pluginContext]);

  return (
    <section className="weaver-plugin-template">
      <p className="weaver-plugin-template__eyebrow">Runtime plugin</p>
      <h1>Plugin Template</h1>
      <p>{message}</p>
    </section>
  );
}
