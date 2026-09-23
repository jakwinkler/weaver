import { useEffect, useRef, useState, type FormEvent } from 'react';
import axios from 'axios';
import { CheckCircle2, FileInput, ShieldCheck } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { usePublicForm, useSubmitPublicForm } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

declare global {
  interface Window {
    grecaptcha?: {
      ready: (callback: () => void) => void;
      render: (element: HTMLElement, options: { sitekey: string }) => number;
      getResponse: (widgetId: number) => string;
      reset: (widgetId: number) => void;
    };
  }
}

function submitError(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'Your request could not be sent. Please try again.';
  if (error.response?.status === 429)
    return 'Too many requests were sent from this connection. Wait a minute, then try again.';
  const message = error.response?.data?.message;
  return typeof message === 'string'
    ? message
    : 'Your request could not be sent. Check the fields and try again.';
}

export function PublicForm() {
  const { tenantSlug = '', formSlug = '' } = useParams<{ tenantSlug: string; formSlug: string }>();
  const { data: form, isLoading, isError } = usePublicForm(tenantSlug, formSlug);
  const submitForm = useSubmitPublicForm(tenantSlug, formSlug);
  const [values, setValues] = useState<Record<string, string>>({});
  const [website, setWebsite] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const captchaElement = useRef<HTMLDivElement>(null);
  const captchaWidgetId = useRef<number | null>(null);

  useEffect(() => {
    if (!form?.captchaSiteKey || !captchaElement.current) return;

    const renderCaptcha = () => {
      window.grecaptcha?.ready(() => {
        if (captchaElement.current && captchaWidgetId.current === null) {
          captchaWidgetId.current = window.grecaptcha!.render(captchaElement.current, {
            sitekey: form.captchaSiteKey!,
          });
        }
      });
    };

    const existingScript = document.getElementById(
      'weaver-recaptcha-script',
    ) as HTMLScriptElement | null;
    if (existingScript) {
      if (window.grecaptcha) renderCaptcha();
      else existingScript.addEventListener('load', renderCaptcha, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'weaver-recaptcha-script';
    script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', renderCaptcha, { once: true });
    document.head.appendChild(script);
  }, [form?.captchaSiteKey]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage('');
    const recaptchaToken =
      captchaWidgetId.current !== null
        ? window.grecaptcha?.getResponse(captchaWidgetId.current)
        : undefined;

    try {
      await submitForm.mutateAsync({ values, website, recaptchaToken });
    } catch (error) {
      setErrorMessage(submitError(error));
      if (captchaWidgetId.current !== null) window.grecaptcha?.reset(captchaWidgetId.current);
    }
  };

  const resetForm = () => {
    setValues({});
    setWebsite('');
    setErrorMessage('');
    submitForm.reset();
    if (captchaWidgetId.current !== null) window.grecaptcha?.reset(captchaWidgetId.current);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-5">
        <p className="text-sm text-muted-foreground">Loading form...</p>
      </div>
    );
  }

  if (isError || !form) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-5">
        <div className="w-full max-w-lg border border-border bg-card p-8 text-center">
          <FileInput className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold text-foreground">This form is unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The link may be incorrect, or the form is no longer accepting responses.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40 text-foreground selection:bg-foreground selection:text-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4 sm:px-8">
          <span className="text-sm font-bold tracking-tight">Weaver</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Secure external intake
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
        <div className="border border-border bg-card">
          <div className="border-b border-border px-6 py-7 sm:px-10 sm:py-9">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
              {form.name}
            </h1>
            {form.description && (
              <p className="mt-3 max-w-[70ch] whitespace-pre-line text-sm leading-6 text-muted-foreground sm:text-base">
                {form.description}
              </p>
            )}
          </div>

          {submitForm.isSuccess ? (
            <div className="px-6 py-12 text-center sm:px-10 sm:py-16" role="status">
              <CheckCircle2 className="mx-auto h-10 w-10 text-green-700 dark:text-green-400" />
              <h2 className="mt-4 text-xl font-semibold text-foreground">
                Your request was received
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                We created issue{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {submitForm.data.issueKey}
                </span>{' '}
                for the team to review.
              </p>
              <Button type="button" variant="outline" className="mt-6" onClick={resetForm}>
                Send another response
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6 px-6 py-8 sm:px-10 sm:py-10">
              {form.fields.map((field) => (
                <div key={field.id} className="space-y-2">
                  <Label htmlFor={field.id} className="text-sm">
                    {field.label}
                    {field.required && (
                      <span className="ml-1 text-destructive" aria-hidden="true">
                        *
                      </span>
                    )}
                  </Label>
                  {field.type === 'textarea' ? (
                    <Textarea
                      id={field.id}
                      value={values[field.id] || ''}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [field.id]: event.target.value }))
                      }
                      placeholder={field.placeholder}
                      required={field.required || field.mapping === 'summary'}
                      rows={6}
                      maxLength={10_000}
                    />
                  ) : field.type === 'select' ? (
                    <select
                      id={field.id}
                      value={values[field.id] || ''}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [field.id]: event.target.value }))
                      }
                      required={field.required || field.mapping === 'summary'}
                      className="block h-10 w-full border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Select an option</option>
                      {field.options?.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={field.id}
                      type={field.type === 'email' ? 'email' : 'text'}
                      value={values[field.id] || ''}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [field.id]: event.target.value }))
                      }
                      placeholder={field.placeholder}
                      required={field.required || field.mapping === 'summary'}
                      maxLength={field.type === 'email' ? 320 : 500}
                      autoComplete={field.type === 'email' ? 'email' : undefined}
                    />
                  )}
                </div>
              ))}

              <div
                aria-hidden="true"
                className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden"
              >
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  name="website"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  autoComplete="off"
                  tabIndex={-1}
                />
              </div>

              {form.captchaSiteKey && (
                <div ref={captchaElement} aria-label="CAPTCHA verification" />
              )}

              {errorMessage && (
                <p
                  role="alert"
                  className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                >
                  {errorMessage}
                </p>
              )}

              <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-muted-foreground">
                  Required fields are marked with an asterisk.
                </p>
                <Button type="submit" disabled={submitForm.isPending} className="sm:min-w-32">
                  {submitForm.isPending ? 'Sending...' : 'Send request'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </main>

      <footer className="px-5 pb-10 text-center text-xs text-muted-foreground">
        Powered by <span className="font-semibold text-foreground">Weaver</span>
      </footer>
    </div>
  );
}
