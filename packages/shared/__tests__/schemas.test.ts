import {
  registerSchema,
  loginSchema,
  createProjectSchema,
  createIssueSchema,
  updateIssueSchema,
  paginationSchema,
  createWorkflowStatusSchema,
  issueKeySchema,
} from '../src/schemas';

describe('registerSchema', () => {
  it('should accept valid registration data', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      displayName: 'Test User',
      orgName: 'Test Org',
      orgSlug: 'test-org',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const result = registerSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
      displayName: 'Test User',
      orgName: 'Test Org',
      orgSlug: 'test-org',
    });
    expect(result.success).toBe(false);
  });

  it('should reject short password', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: '1234567',
      displayName: 'Test User',
      orgName: 'Test Org',
      orgSlug: 'test-org',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid org slug', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      displayName: 'Test User',
      orgName: 'Test Org',
      orgSlug: 'INVALID SLUG',
    });
    expect(result.success).toBe(false);
  });

  it('should reject org slug with trailing hyphen', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      displayName: 'Test User',
      orgName: 'Test Org',
      orgSlug: 'test-org-',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('should accept valid login', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty password', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('createProjectSchema', () => {
  it('should accept valid project', () => {
    const result = createProjectSchema.safeParse({
      name: 'My Project',
      key: 'MP',
    });
    expect(result.success).toBe(true);
  });

  it('should accept key with numbers', () => {
    const result = createProjectSchema.safeParse({
      name: 'Web App v2',
      key: 'WEB2',
    });
    expect(result.success).toBe(true);
  });

  it('should reject lowercase key', () => {
    const result = createProjectSchema.safeParse({
      name: 'My Project',
      key: 'mp',
    });
    expect(result.success).toBe(false);
  });

  it('should reject single char key', () => {
    const result = createProjectSchema.safeParse({
      name: 'My Project',
      key: 'M',
    });
    expect(result.success).toBe(false);
  });

  it('should reject key starting with number', () => {
    const result = createProjectSchema.safeParse({
      name: 'My Project',
      key: '2MP',
    });
    expect(result.success).toBe(false);
  });

  it('should reject key longer than 10 chars', () => {
    const result = createProjectSchema.safeParse({
      name: 'My Project',
      key: 'ABCDEFGHIJK',
    });
    expect(result.success).toBe(false);
  });
});

describe('createIssueSchema', () => {
  it('should accept minimal issue', () => {
    const result = createIssueSchema.safeParse({
      summary: 'Fix login bug',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe('medium');
      expect(result.data.labels).toEqual([]);
      expect(result.data.customFields).toEqual({});
    }
  });

  it('should accept full issue', () => {
    const result = createIssueSchema.safeParse({
      summary: 'Fix login bug',
      priority: 'high',
      labels: ['bug', 'auth'],
      assigneeId: '550e8400-e29b-41d4-a716-446655440000',
      customFields: { severity: 'critical' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid priority', () => {
    const result = createIssueSchema.safeParse({
      summary: 'Fix login bug',
      priority: 'urgent',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty summary', () => {
    const result = createIssueSchema.safeParse({
      summary: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateIssueSchema', () => {
  it('should accept partial updates', () => {
    const result = updateIssueSchema.safeParse({
      summary: 'Updated summary',
    });
    expect(result.success).toBe(true);
  });

  it('should accept null assigneeId (unassign)', () => {
    const result = updateIssueSchema.safeParse({
      assigneeId: null,
    });
    expect(result.success).toBe(true);
  });

  it('should accept null description (clear rich text)', () => {
    const result = updateIssueSchema.safeParse({
      description: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('paginationSchema', () => {
  it('should use defaults', () => {
    const result = paginationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.perPage).toBe(50);
    }
  });

  it('should coerce string numbers', () => {
    const result = paginationSchema.safeParse({ page: '3', perPage: '25' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.perPage).toBe(25);
    }
  });

  it('should reject page < 1', () => {
    const result = paginationSchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject perPage > 200', () => {
    const result = paginationSchema.safeParse({ perPage: 201 });
    expect(result.success).toBe(false);
  });
});

describe('createWorkflowStatusSchema', () => {
  it('should accept valid status', () => {
    const result = createWorkflowStatusSchema.safeParse({
      name: 'In Progress',
      category: 'in_progress',
      color: '#3B82F6',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid color', () => {
    const result = createWorkflowStatusSchema.safeParse({
      name: 'In Progress',
      category: 'in_progress',
      color: 'blue',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid category', () => {
    const result = createWorkflowStatusSchema.safeParse({
      name: 'In Progress',
      category: 'working',
      color: '#3B82F6',
    });
    expect(result.success).toBe(false);
  });
});

describe('issueKeySchema', () => {
  it('should accept valid issue keys', () => {
    expect(issueKeySchema.safeParse('WEB-1').success).toBe(true);
    expect(issueKeySchema.safeParse('WEB-123').success).toBe(true);
    expect(issueKeySchema.safeParse('MP2-9999').success).toBe(true);
  });

  it('should reject invalid issue keys', () => {
    expect(issueKeySchema.safeParse('web-1').success).toBe(false);
    expect(issueKeySchema.safeParse('WEB').success).toBe(false);
    expect(issueKeySchema.safeParse('WEB-').success).toBe(false);
    expect(issueKeySchema.safeParse('W-1').success).toBe(false);
  });
});
