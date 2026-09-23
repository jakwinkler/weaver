import { useEffect, useMemo, useState } from 'react';
import type { Form } from '@weaver/shared';
import QRCode from 'qrcode';
import { Check, Clipboard, Code2, ExternalLink, Link2, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface FormShareDialogProps {
  form: Form | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard copy was rejected');
}

export function FormShareDialog({ form, open, onOpenChange }: FormShareDialogProps) {
  const [copied, setCopied] = useState<'url' | 'embed' | null>(null);
  const [copyError, setCopyError] = useState<'url' | 'embed' | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const publicUrl = useMemo(() => {
    if (!form?.tenantSlug) return '';
    return `${window.location.origin}/public/${form.tenantSlug}/forms/${form.slug}`;
  }, [form]);
  const embedCode = publicUrl
    ? `<iframe src="${publicUrl}" title="${form?.name || 'Weaver form'}" width="100%" height="720" style="border:0"></iframe>`
    : '';

  useEffect(() => {
    if (!publicUrl) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(publicUrl, {
      width: 220,
      margin: 1,
      color: { dark: '#17191c', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [publicUrl]);

  const handleCopy = async (kind: 'url' | 'embed', value: string) => {
    setCopied(null);
    setCopyError(null);
    try {
      await copyText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2400);
    } catch {
      setCopyError(kind);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Share {form?.name || 'form'}</DialogTitle>
          <DialogDescription>
            Send the public link directly or place the form on another site.
          </DialogDescription>
        </DialogHeader>

        {!form?.active && (
          <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            This form is inactive. Visitors will see a not-found message until you activate it.
          </p>
        )}

        <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div className="min-w-0 space-y-5">
            <section className="space-y-2" aria-labelledby="public-link-heading">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <Label id="public-link-heading" htmlFor="form-public-url">
                  Public link
                </Label>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_36px_36px] gap-2">
                <Input
                  id="form-public-url"
                  value={publicUrl}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopy('url', publicUrl)}
                  aria-label={copied === 'url' ? 'Public link copied' : 'Copy public link'}
                >
                  {copied === 'url' ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Clipboard className="h-4 w-4" />
                  )}
                </Button>
                <Button type="button" variant="outline" size="icon" asChild>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open public form"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
              <p
                role={copyError === 'url' ? 'alert' : 'status'}
                aria-live="polite"
                className={
                  copyError === 'url' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'
                }
              >
                {copied === 'url' && 'Copied to clipboard.'}
                {copyError === 'url' && 'Copy failed. Select the link and copy it manually.'}
              </p>
            </section>

            <section className="space-y-2" aria-labelledby="embed-heading">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-muted-foreground" />
                <Label id="embed-heading" htmlFor="form-embed-code">
                  Embed code
                </Label>
              </div>
              <textarea
                id="form-embed-code"
                value={embedCode}
                readOnly
                rows={5}
                className="block w-full resize-none border border-input bg-muted/30 px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleCopy('embed', embedCode)}
              >
                {copied === 'embed' ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Clipboard className="h-4 w-4" />
                )}
                {copied === 'embed' ? 'Copied' : 'Copy embed code'}
              </Button>
              <p
                role={copyError === 'embed' ? 'alert' : 'status'}
                aria-live="polite"
                className={
                  copyError === 'embed'
                    ? 'text-xs text-destructive'
                    : 'text-xs text-muted-foreground'
                }
              >
                {copied === 'embed' && 'Embed code copied to clipboard.'}
                {copyError === 'embed' &&
                  'Copy failed. Select the embed code and copy it manually.'}
              </p>
            </section>
          </div>

          <section
            className="flex flex-col items-center justify-center border border-border bg-white p-3"
            aria-labelledby="qr-heading"
          >
            <div className="mb-3 flex items-center gap-2 self-start text-sm font-medium text-gray-900">
              <QrCode className="h-4 w-4" />
              <span id="qr-heading">QR code</span>
            </div>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code for ${form?.name || 'public form'}`}
                className="h-[156px] w-[156px]"
              />
            ) : (
              <div className="flex h-[156px] w-[156px] items-center justify-center bg-gray-50 text-xs text-gray-500">
                QR code unavailable
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
