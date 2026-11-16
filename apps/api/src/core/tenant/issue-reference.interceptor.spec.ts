import { lastValueFrom, of } from 'rxjs';
import { IssueReferenceInterceptor } from './issue-reference.interceptor';
import { tenantStorage } from './tenant.context';

describe('streamed HTTP responses', () => {
  it('does not traverse or query for an already-sent response', async () => {
    const response: Record<string, unknown> = { headersSent: true };
    response.socket = { response };
    const connections = { getEntityManager: jest.fn() };
    const interceptor = new IssueReferenceInterceptor(connections as never);
    const context = { switchToHttp: () => ({ getResponse: () => response }) };
    await tenantStorage.run({ tenantId: 'fixture', schemaName: 'tenant_fixture' }, async () => {
      expect(
        await lastValueFrom(
          interceptor.intercept(context as never, { handle: () => of(response) }),
        ),
      ).toBe(response);
    });
    expect(connections.getEntityManager).not.toHaveBeenCalled();
  });
});
