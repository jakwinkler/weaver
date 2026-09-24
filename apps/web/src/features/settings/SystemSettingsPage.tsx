import { useState, useEffect, type FormEvent } from 'react';
import { useTenantSettings, useUpdateTenantSettings, useTestSmtp } from '@/api/hooks-settings';
import { useThemeStore } from '@/stores';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Settings, Mail, ShieldCheck } from 'lucide-react';
import type { TenantSettings } from '@weaver/shared';

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

type Tab = 'general' | 'email' | 'sso';

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
          <TabsTrigger value="sso" className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            SSO
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="email">
          <EmailTab />
        </TabsContent>
        <TabsContent value="sso">
          <SsoTab />
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
  const [initialized, setInitialized] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings && !initialized) {
      setTimezone(settings.timezone);
      setInitialized(true);
    }
  }, [settings, initialized]);

  const handleSave = async () => {
    setSaved(false);
    await updateSettings.mutateAsync({ timezone, theme });
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

const EMPTY_SSO: TenantSettings['sso'] = {
  google: { enabled: true },
  github: { enabled: true },
  saml: { enabled: false, idpUrl: '', cert: '' },
  oidc: {
    enabled: false,
    discoveryUrl: '',
    clientId: '',
    clientSecret: '',
  },
};

function SsoTab() {
  const { data: settings, isLoading } = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();
  const [sso, setSso] = useState<TenantSettings['sso']>(EMPTY_SSO);
  const [initialized, setInitialized] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings && !initialized) {
      setSso(settings.sso ?? EMPTY_SSO);
      setInitialized(true);
    }
  }, [settings, initialized]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    await updateSettings.mutateAsync({ sso });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const readCertificate = async (file: File | undefined) => {
    if (!file) return;
    const cert = await file.text();
    setSso((current) => ({
      ...current,
      saml: { ...current.saml, cert },
    }));
  };

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div>
            <h2 className="font-semibold text-foreground">Social sign-in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Control which social providers members can use for this organization.
            </p>
          </div>
          <ProviderToggle
            label="Google"
            description="Allow members to use their Google account."
            checked={sso.google.enabled}
            onCheckedChange={(enabled) =>
              setSso((current) => ({ ...current, google: { enabled } }))
            }
          />
          <ProviderToggle
            label="GitHub"
            description="Allow members to use their GitHub account."
            checked={sso.github.enabled}
            onCheckedChange={(enabled) =>
              setSso((current) => ({ ...current, github: { enabled } }))
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <ProviderToggle
            label="SAML 2.0"
            description="Connect an enterprise identity provider using signed SAML assertions."
            checked={sso.saml.enabled}
            onCheckedChange={(enabled) =>
              setSso((current) => ({
                ...current,
                saml: { ...current.saml, enabled },
              }))
            }
          />
          <div>
            <Label htmlFor="saml-idp-url" className="mb-1 block">
              Identity provider sign-in URL
            </Label>
            <Input
              id="saml-idp-url"
              type="url"
              required={sso.saml.enabled}
              disabled={!sso.saml.enabled}
              value={sso.saml.idpUrl}
              onChange={(event) =>
                setSso((current) => ({
                  ...current,
                  saml: { ...current.saml, idpUrl: event.target.value },
                }))
              }
              placeholder="https://idp.example.com/sso/saml"
            />
          </div>
          <div>
            <Label htmlFor="saml-cert" className="mb-1 block">
              Identity provider certificate
            </Label>
            <Input
              type="file"
              accept=".cer,.crt,.pem,text/plain,application/x-x509-ca-cert"
              disabled={!sso.saml.enabled}
              onChange={(event) => void readCertificate(event.target.files?.[0])}
              className="mb-2"
            />
            <Textarea
              id="saml-cert"
              required={sso.saml.enabled}
              disabled={!sso.saml.enabled}
              value={sso.saml.cert}
              onChange={(event) =>
                setSso((current) => ({
                  ...current,
                  saml: { ...current.saml, cert: event.target.value },
                }))
              }
              placeholder="-----BEGIN CERTIFICATE-----"
              rows={6}
              className="font-mono text-xs"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <ProviderToggle
            label="OpenID Connect"
            description="Connect Microsoft Entra ID, Okta, or another OIDC provider."
            checked={sso.oidc.enabled}
            onCheckedChange={(enabled) =>
              setSso((current) => ({
                ...current,
                oidc: { ...current.oidc, enabled },
              }))
            }
          />
          <div>
            <Label htmlFor="oidc-discovery-url" className="mb-1 block">
              Discovery URL
            </Label>
            <Input
              id="oidc-discovery-url"
              type="url"
              required={sso.oidc.enabled}
              disabled={!sso.oidc.enabled}
              value={sso.oidc.discoveryUrl}
              onChange={(event) =>
                setSso((current) => ({
                  ...current,
                  oidc: { ...current.oidc, discoveryUrl: event.target.value },
                }))
              }
              placeholder="https://login.example.com/.well-known/openid-configuration"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="oidc-client-id" className="mb-1 block">
                Client ID
              </Label>
              <Input
                id="oidc-client-id"
                required={sso.oidc.enabled}
                disabled={!sso.oidc.enabled}
                value={sso.oidc.clientId}
                onChange={(event) =>
                  setSso((current) => ({
                    ...current,
                    oidc: { ...current.oidc, clientId: event.target.value },
                  }))
                }
              />
            </div>
            <div>
              <Label htmlFor="oidc-client-secret" className="mb-1 block">
                Client secret
              </Label>
              <Input
                id="oidc-client-secret"
                type="password"
                required={sso.oidc.enabled}
                disabled={!sso.oidc.enabled}
                value={sso.oidc.clientSecret}
                onChange={(event) =>
                  setSso((current) => ({
                    ...current,
                    oidc: { ...current.oidc, clientSecret: event.target.value },
                  }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={updateSettings.isPending}>
          {updateSettings.isPending ? 'Saving...' : 'Save SSO Settings'}
        </Button>
        {saved && <span className="text-sm text-green-600">SSO settings saved!</span>}
        {updateSettings.isError && (
          <span className="text-sm text-destructive">Failed to save SSO settings.</span>
        )}
      </div>
    </form>
  );
}

function ProviderToggle({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={`Enable ${label}`} />
    </div>
  );
}
