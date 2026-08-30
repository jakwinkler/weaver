import {
  ISSUE_PRIORITIES,
  STATUS_CATEGORIES,
  BOARD_TYPES,
  TENANT_PLANS,
  TENANT_ROLES,
  PROJECT_KEY_REGEX,
  ISSUE_KEY_REGEX,
  API_KEY_PREFIX,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  AUTH_PROVIDERS,
} from '../src/constants';

describe('constants', () => {
  it('should define all issue priorities', () => {
    expect(ISSUE_PRIORITIES).toEqual(['lowest', 'low', 'medium', 'high', 'highest']);
  });

  it('should define all status categories', () => {
    expect(STATUS_CATEGORIES).toEqual(['todo', 'in_progress', 'done']);
  });

  it('should define board types', () => {
    expect(BOARD_TYPES).toEqual(['kanban', 'scrum']);
  });

  it('should define tenant plans', () => {
    expect(TENANT_PLANS).toEqual(['free', 'pro', 'enterprise']);
  });

  it('should define tenant roles', () => {
    expect(TENANT_ROLES).toEqual(['owner', 'admin', 'member', 'viewer']);
  });

  it('should define all authentication providers', () => {
    expect(AUTH_PROVIDERS).toEqual(['local', 'google', 'github', 'saml', 'oidc']);
  });

  it('should have correct API key prefix', () => {
    expect(API_KEY_PREFIX).toBe('wvr_');
  });

  it('should have correct page defaults', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(50);
    expect(MAX_PAGE_SIZE).toBe(200);
  });
});

describe('PROJECT_KEY_REGEX', () => {
  it('should match valid project keys', () => {
    expect(PROJECT_KEY_REGEX.test('WEB')).toBe(true);
    expect(PROJECT_KEY_REGEX.test('MP')).toBe(true);
    expect(PROJECT_KEY_REGEX.test('WEB2')).toBe(true);
    expect(PROJECT_KEY_REGEX.test('ABCDEFGHIJ')).toBe(true);
  });

  it('should reject invalid project keys', () => {
    expect(PROJECT_KEY_REGEX.test('M')).toBe(false);
    expect(PROJECT_KEY_REGEX.test('web')).toBe(false);
    expect(PROJECT_KEY_REGEX.test('2WEB')).toBe(false);
    expect(PROJECT_KEY_REGEX.test('WEB-123')).toBe(false);
    expect(PROJECT_KEY_REGEX.test('ABCDEFGHIJK')).toBe(false);
  });
});

describe('ISSUE_KEY_REGEX', () => {
  it('should match valid issue keys', () => {
    expect(ISSUE_KEY_REGEX.test('WEB-1')).toBe(true);
    expect(ISSUE_KEY_REGEX.test('WEB-123')).toBe(true);
    expect(ISSUE_KEY_REGEX.test('MP2-9999')).toBe(true);
  });

  it('should reject invalid issue keys', () => {
    expect(ISSUE_KEY_REGEX.test('web-1')).toBe(false);
    expect(ISSUE_KEY_REGEX.test('WEB')).toBe(false);
    expect(ISSUE_KEY_REGEX.test('W-1')).toBe(false);
    expect(ISSUE_KEY_REGEX.test('WEB-')).toBe(false);
  });
});
