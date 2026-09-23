export function PluginPage() {
  const pluginName = WEAVER_PLUGIN_DISPLAY_NAME;

  return (
    <section className="weaver-plugin">
      <p className="weaver-plugin-eyebrow">Weaver plugin</p>
      <h1>{pluginName}</h1>
      <p>Edit src/client/PluginPage.tsx to build your plugin experience.</p>
    </section>
  );
}
