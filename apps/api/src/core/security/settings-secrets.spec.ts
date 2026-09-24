import { preserveSettingsSecrets, redactSettingsSecrets } from './settings-secrets';

describe('settings secret handling', () => {
  it('masks password fields nested in settings and preserves them on round trip', () => {
    const current = { ldap: { bindPassword: 'synthetic-secret' }, smtp: { pass: 'smtp-secret', host: 'mail.example' } };
    const visible = redactSettingsSecrets(current);
    expect(visible.ldap.bindPassword).toBe('********');
    expect(visible.smtp.host).toBe('mail.example');
    expect(preserveSettingsSecrets(visible, current)).toEqual(current);
  });
});
