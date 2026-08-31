import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Laptop, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import type { AutomaticTimeApi, AutomaticTimeDevice, AutomaticTimePairingRequest } from './types';

const SCOPE_LABELS: Record<string, string> = {
  'automatic-time:candidates:read': 'Read your bounded issue candidate list',
  'automatic-time:drafts:read': 'Read your private Automatic Time drafts',
  'automatic-time:drafts:write': 'Create and update your private derived drafts',
  'automatic-time:rules:read': 'Read your Automatic Time assignment rules',
  'automatic-time:device:heartbeat': 'Report device status and companion version',
};

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function AutomaticTimeSettingsPage({ api }: { api: AutomaticTimeApi }) {
  const [searchParams] = useSearchParams();
  const userCode = searchParams.get('pairing');
  const [pairing, setPairing] = useState<AutomaticTimePairingRequest | null>(null);
  const [devices, setDevices] = useState<AutomaticTimeDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState('');

  const loadDevices = useCallback(async () => {
    setDevices(await api.listDevices());
  }, [api]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextDevices, nextPairing] = await Promise.all([
        api.listDevices(),
        userCode ? api.getPairingRequest(userCode) : Promise.resolve(null),
      ]);
      setDevices(nextDevices);
      setPairing(nextPairing);
    } catch {
      setError('Companion settings could not be loaded. The pairing request may have expired.');
    } finally {
      setLoading(false);
    }
  }, [api, userCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async () => {
    if (!pairing) return;
    setBusy('approve');
    setError('');
    try {
      await api.approvePairingRequest(pairing.userCode);
      setApproved(true);
    } catch {
      setError('Pairing approval failed. Confirm the code is still active and retry.');
    } finally {
      setBusy('');
    }
  };

  const revoke = async (device: AutomaticTimeDevice) => {
    setBusy(device.id);
    setError('');
    try {
      await api.revokeDevice(device.id);
      await loadDevices();
    } catch {
      setError(`Could not revoke ${device.displayName}.`);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Automatic Time Settings</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Pair and revoke macOS companions without sharing your browser session.
          </p>
        </div>
        <button
          type="button"
          aria-label="Refresh companion devices"
          onClick={() => void load()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      {pairing && !approved && (
        <section className="rounded-lg border border-primary/30 bg-card p-5">
          <div className="flex items-start gap-3">
            <Laptop className="mt-0.5 h-5 w-5 text-primary" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-foreground">
                {pairing.displayName} wants to pair
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                macOS companion {pairing.companionVersion} · code {pairing.userCode} · expires{' '}
                {formatTimestamp(pairing.expiresAt)}
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground">
                {pairing.requestedScopes.map((scope) => (
                  <li key={scope} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    {SCOPE_LABELS[scope] ?? scope}
                  </li>
                ))}
              </ul>
              <div className="mt-4 rounded-md bg-muted p-3 text-sm font-medium text-foreground">
                <div>Cannot release official time</div>
                <div className="mt-1 font-normal text-muted-foreground">
                  The device also cannot edit official entries, administer plugins, or read
                  unrelated Weaver data.
                </div>
              </div>
              <button
                type="button"
                onClick={() => void approve()}
                disabled={busy === 'approve'}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" />
                {busy === 'approve' ? 'Approving...' : 'Approve device'}
              </button>
            </div>
          </div>
        </section>
      )}

      {approved && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5" />
          <div>
            <div className="font-semibold">Device approved</div>
            <div className="text-sm">Return to the companion while it completes the exchange.</div>
          </div>
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold text-foreground">Companion devices</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Revocation takes effect on the next request. Credentials expire automatically.
        </p>

        {loading ? (
          <p className="py-10 text-sm text-muted-foreground">Loading companion devices...</p>
        ) : devices.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border py-10 text-center">
            <Laptop className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-2 text-sm font-medium text-foreground">No paired devices</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {devices.map((device) => (
              <article
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <Laptop className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{device.displayName}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {device.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Version {device.companionVersion} · last seen{' '}
                      {formatTimestamp(device.lastSeenAt)} · expires{' '}
                      {formatTimestamp(device.expiresAt)}
                    </p>
                  </div>
                </div>
                {device.status === 'active' && (
                  <button
                    type="button"
                    aria-label={`Revoke ${device.displayName}`}
                    onClick={() => void revoke(device)}
                    disabled={busy === device.id}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <Unplug className="h-4 w-4" />
                    Revoke
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
