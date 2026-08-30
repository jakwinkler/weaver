import { useMemo, useState } from 'react';
import { Check, Cloud, Server } from 'lucide-react';
import type {
  JiraAuth,
  JiraConnectionConfig,
  JiraProjectSummary,
  JiraSource,
} from '@weaver/shared';
import { useDiscoverJiraProjects, useStartJiraImport } from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ImportProgress } from './ImportProgress';

const STEPS = ['Source', 'Credentials', 'Connect', 'Projects', 'Review'];

export function ImportWizard() {
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<JiraSource>('jira_cloud');
  const [baseUrl, setBaseUrl] = useState('');
  const [authType, setAuthType] = useState<JiraAuth['type']>('api_token');
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [projects, setProjects] = useState<JiraProjectSummary[]>([]);
  const [importAll, setImportAll] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [importId, setImportId] = useState<string | null>(null);
  const discover = useDiscoverJiraProjects();
  const startImport = useStartJiraImport();

  const config = useMemo<JiraConnectionConfig>(
    () => ({
      source,
      baseUrl: baseUrl.trim(),
      auth:
        authType === 'oauth'
          ? { type: 'oauth', accessToken: secret }
          : { type: 'api_token', token: secret, ...(email.trim() ? { email: email.trim() } : {}) },
    }),
    [authType, baseUrl, email, secret, source],
  );

  const credentialsValid = Boolean(
    baseUrl.trim() && secret && (source !== 'jira_cloud' || authType === 'oauth' || email.trim()),
  );
  const selectionValid = projects.length > 0 && (importAll || selectedKeys.size > 0);

  const connect = async () => {
    const available = await discover.mutateAsync(config);
    setProjects(available);
    setSelectedKeys(new Set());
    setStep(4);
  };

  const start = async () => {
    const job = await startImport.mutateAsync({
      config,
      ...(importAll ? {} : { projectKeys: [...selectedKeys] }),
    });
    setSecret('');
    setImportId(job.id);
  };

  const toggleProject = (key: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const reset = () => {
    setStep(1);
    setProjects([]);
    setImportAll(true);
    setSelectedKeys(new Set());
    setImportId(null);
    setSecret('');
    discover.reset();
    startImport.reset();
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Import from Jira</CardTitle>
        <CardDescription>
          Move projects, issues, workflows, comments, attachments, and sprints from Jira Cloud or
          Jira Server.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {importId ? (
          <ImportProgress importId={importId} onStartAnother={reset} />
        ) : (
          <div className="space-y-6">
            <ol className="grid grid-cols-5 gap-2" aria-label="Jira import steps">
              {STEPS.map((label, index) => {
                const number = index + 1;
                const complete = number < step;
                return (
                  <li key={label} className="text-center">
                    <div
                      className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                        complete
                          ? 'bg-primary text-primary-foreground'
                          : number === step
                            ? 'border-2 border-primary text-primary'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {complete ? <Check className="h-4 w-4" /> : number}
                    </div>
                    <span className="mt-1 block text-xs text-muted-foreground">{label}</span>
                  </li>
                );
              })}
            </ol>

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-foreground">Choose your Jira source</h3>
                  <p className="text-sm text-muted-foreground">
                    Cloud uses REST API v3. Server and Data Center use REST API v2.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SourceButton
                    selected={source === 'jira_cloud'}
                    icon={<Cloud className="h-5 w-5" />}
                    title="Jira Cloud"
                    description="your-company.atlassian.net"
                    onClick={() => setSource('jira_cloud')}
                  />
                  <SourceButton
                    selected={source === 'jira_server'}
                    icon={<Server className="h-5 w-5" />}
                    title="Jira Server / Data Center"
                    description="A self-hosted Jira instance"
                    onClick={() => setSource('jira_server')}
                  />
                </div>
                <Button type="button" onClick={() => setStep(2)}>
                  Continue
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="max-w-xl space-y-4">
                <div>
                  <Label htmlFor="jira-url">Jira URL</Label>
                  <Input
                    id="jira-url"
                    type="url"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    placeholder={
                      source === 'jira_cloud'
                        ? 'https://your-company.atlassian.net'
                        : 'https://jira.your-company.com'
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="jira-auth-type">Authentication</Label>
                  <select
                    id="jira-auth-type"
                    value={authType}
                    onChange={(event) => setAuthType(event.target.value as JiraAuth['type'])}
                    className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="api_token">
                      {source === 'jira_cloud' ? 'API token' : 'Personal access token'}
                    </option>
                    <option value="oauth">OAuth access token</option>
                  </select>
                </div>
                {source === 'jira_cloud' && authType === 'api_token' && (
                  <div>
                    <Label htmlFor="jira-email">Atlassian account email</Label>
                    <Input
                      id="jira-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="username"
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="jira-token">
                    {authType === 'oauth' ? 'OAuth access token' : 'API token'}
                  </Label>
                  <Input
                    id="jira-token"
                    type="password"
                    value={secret}
                    onChange={(event) => setSecret(event.target.value)}
                    autoComplete="new-password"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Credentials are used by this import only and are not stored in Weaver.
                  </p>
                </div>
                <WizardButtons
                  back={() => setStep(1)}
                  next={() => setStep(3)}
                  nextDisabled={!credentialsValid}
                />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-foreground">Test the connection</h3>
                  <p className="text-sm text-muted-foreground">
                    Weaver will verify the credentials and load every Jira project you can access.
                  </p>
                </div>
                {discover.isError && (
                  <p className="text-sm text-destructive">{errorMessage(discover.error)}</p>
                )}
                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button type="button" onClick={connect} disabled={discover.isPending}>
                    {discover.isPending ? 'Connecting...' : 'Connect to Jira'}
                  </Button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-foreground">Choose projects</h3>
                  <p className="text-sm text-muted-foreground">
                    {projects.length} accessible Jira projects found.
                  </p>
                </div>
                {projects.length === 0 && (
                  <p className="text-sm text-destructive">
                    No accessible Jira projects were found.
                  </p>
                )}
                <label className="flex items-start gap-3 border border-border p-3">
                  <input
                    type="checkbox"
                    checked={importAll}
                    onChange={(event) => setImportAll(event.target.checked)}
                    className="mt-1 accent-primary"
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">
                      Import all accessible projects
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Turn this off to choose an exact project allowlist.
                    </span>
                  </span>
                </label>
                {!importAll && (
                  <div className="max-h-72 divide-y divide-border overflow-y-auto border border-border">
                    {projects.map((project) => (
                      <label
                        key={project.id}
                        className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(project.key)}
                          onChange={() => toggleProject(project.key)}
                          className="accent-primary"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground">
                            {project.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">{project.key}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {!importAll && selectedKeys.size === 0 && (
                  <p className="text-sm text-destructive">Select at least one project.</p>
                )}
                <WizardButtons
                  back={() => setStep(3)}
                  next={() => setStep(5)}
                  nextDisabled={!selectionValid}
                />
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-foreground">Review the import</h3>
                  <p className="text-sm text-muted-foreground">
                    Existing items from this Jira instance are reused when you run the import again.
                    Missing items are imported, and recovered sprint assignments are repaired.
                  </p>
                </div>
                <dl className="grid gap-3 border border-border p-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Source</dt>
                    <dd className="font-medium text-foreground">
                      {source === 'jira_cloud' ? 'Jira Cloud' : 'Jira Server / Data Center'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Jira URL</dt>
                    <dd className="break-all font-medium text-foreground">{baseUrl}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Projects</dt>
                    <dd className="font-medium text-foreground">
                      {importAll
                        ? `All ${projects.length} accessible projects`
                        : `${selectedKeys.size} selected projects`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Data</dt>
                    <dd className="font-medium text-foreground">
                      Projects, workflows, issues, comments, attachments, and sprints
                    </dd>
                  </div>
                </dl>
                {!importAll && (
                  <p className="text-sm text-muted-foreground">
                    Only {[...selectedKeys].sort().join(', ')} will be imported. Every unspecified
                    Jira project will be skipped.
                  </p>
                )}
                {startImport.isError && (
                  <p className="text-sm text-destructive">{errorMessage(startImport.error)}</p>
                )}
                <div className="flex gap-3">
                  <Button type="button" variant="outline" onClick={() => setStep(4)}>
                    Back
                  </Button>
                  <Button type="button" onClick={start} disabled={startImport.isPending}>
                    {startImport.isPending ? 'Starting import...' : 'Start Jira import'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SourceButton({
  selected,
  icon,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 border p-4 text-left ${selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
    >
      <span className={selected ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
      <span>
        <span className="block font-medium text-foreground">{title}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

function WizardButtons({
  back,
  next,
  nextDisabled,
}: {
  back: () => void;
  next: () => void;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <Button type="button" variant="outline" onClick={back}>
        Back
      </Button>
      <Button type="button" onClick={next} disabled={nextDisabled}>
        Continue
      </Button>
    </div>
  );
}

function errorMessage(error: unknown): string {
  const responseMessage = (error as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  return responseMessage || (error instanceof Error ? error.message : 'The Jira request failed.');
}
