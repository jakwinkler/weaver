import { useState, useEffect, type FormEvent } from 'react';
import { useTenantSettings, useUpdateTenantSettings, useTestSmtp } from '@/api/hooks-settings';
import { useThemeStore } from '@/stores';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, Mail, X } from 'lucide-react';

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Warsaw',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
];

type Tab = 'general' | 'email';

export function SystemSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">System Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure your organization settings</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)} className="mb-6">
        <TabsList>
          <TabsTrigger value="general" className="flex items-center gap-1.5">
            <Settings className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-1.5">
            <Mail className="h-4 w-4" />
            Email
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="email">
          <EmailTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralTab() {
  const { data: settings, isLoading } = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const [timezone, setTimezone] = useState('UTC');
  const [domainInput, setDomainInput] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings && !initialized) {
      setTimezone(settings.timezone);
      setDomains(settings.allowedDomains || []);
      setInitialized(true);
    }
  }, [settings, initialized]);

  const handleAddDomain = () => {
    const trimmed = domainInput.trim().toLowerCase();
    if (trimmed && !domains.includes(trimmed)) {
      setDomains([...domains, trimmed]);
    }
    setDomainInput('');
  };

  const handleRemoveDomain = (d: string) => {
    setDomains(domains.filter((x) => x !== d));
  };

  const handleDomainKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddDomain();
    }
  };

  const handleSave = async () => {
    setSaved(false);
    await updateSettings.mutateAsync({ timezone, theme, allowedDomains: domains });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <div>
          <Label className="mb-1 block">Timezone</Label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="block w-full max-w-sm border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label className="mb-1 block">Theme</Label>
          <div className="flex gap-3">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={`border px-4 py-2 text-sm font-medium capitalize ${
                  theme === t
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-1 block">Allowed Registration Domains</Label>
          <p className="mb-2 text-xs text-muted-foreground">
            If set, only users with email addresses from these domains can register. Leave empty to
            allow all.
          </p>
          <div className="flex gap-2">
            <Input
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              onKeyDown={handleDomainKeyDown}
              onBlur={handleAddDomain}
              placeholder="e.g. company.com"
              className="max-w-sm"
            />
            <Button type="button" variant="outline" onClick={handleAddDomain}>
              Add
            </Button>
          </div>
          {domains.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {domains.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 border border-border bg-muted px-2 py-1 text-xs text-foreground"
                >
                  {d}
                  <button
                    type="button"
                    onClick={() => handleRemoveDomain(d)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? 'Saving...' : 'Save Settings'}
          </Button>
          {saved && <span className="text-sm text-green-600">Settings saved!</span>}
          {updateSettings.isError && (
            <span className="text-sm text-destructive">Failed to save.</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EmailTab() {
  const { data: settings, isLoading } = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();
  const testSmtp = useTestSmtp();

  const [host, setHost] = useState('');
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings && !initialized) {
      if (settings.smtp) {
        setHost(settings.smtp.host);
        setPort(settings.smtp.port);
        setSecure(settings.smtp.secure);
        setUser(settings.smtp.user);
        setPass(settings.smtp.pass);
        setFromName(settings.smtp.fromName);
        setFromEmail(settings.smtp.fromEmail);
      }
      setInitialized(true);
    }
  }, [settings, initialized]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);

    const smtp = host.trim()
      ? { host: host.trim(), port, secure, user, pass, fromName, fromEmail }
      : null;

    await updateSettings.mutateAsync({ smtp });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    try {
      await testSmtp.mutateAsync({
        host: host.trim(),
        port,
        secure,
        user,
        pass,
        fromName,
        fromEmail,
      });
    } catch {
      // error shown via testSmtp.isError
    }
  };

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">SMTP Host</Label>
              <Input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="smtp.example.com"
              />
            </div>
            <div>
              <Label className="mb-1 block">Port</Label>
              <Input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={secure}
                onChange={(e) => setSecure(e.target.checked)}
                className="accent-primary"
              />
              <span className="text-sm text-foreground">Use SSL/TLS</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">Username</Label>
              <Input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div>
              <Label className="mb-1 block">Password</Label>
              <Input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1 block">From Name</Label>
              <Input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="Weaver"
              />
            </div>
            <div>
              <Label className="mb-1 block">From Email</Label>
              <Input
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="noreply@example.com"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={updateSettings.isPending}>
              {updateSettings.isPending ? 'Saving...' : 'Save SMTP Settings'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={testSmtp.isPending || !host.trim()}
            >
              {testSmtp.isPending ? 'Sending...' : 'Send Test Email'}
            </Button>
          </div>

          {saved && <p className="text-sm text-green-600">SMTP settings saved!</p>}
          {updateSettings.isError && (
            <p className="text-sm text-destructive">Failed to save SMTP settings.</p>
          )}
          {testSmtp.isSuccess && (
            <p className="text-sm text-green-600">Test email sent successfully!</p>
          )}
          {testSmtp.isError && (
            <p className="text-sm text-destructive">
              Failed to send test email. Check your SMTP configuration.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
