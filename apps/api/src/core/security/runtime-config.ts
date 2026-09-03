const MINIMUM_JWT_SECRET_LENGTH = 32;
const PLACEHOLDER_SECRET = /(change|replace)[-_ ]?me|example|test[-_ ]?secret|your[-_ ]?secret/i;

type RuntimeEnvironment = {
  NODE_ENV?: string;
  JWT_SECRET?: string;
  JWT_REFRESH_SECRET?: string;
};

export function validateSecurityConfiguration(
  environment: RuntimeEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  },
): void {
  if (environment.NODE_ENV !== 'production') {
    return;
  }

  const jwtSecret = environment.JWT_SECRET;
  if (
    !jwtSecret ||
    jwtSecret.length < MINIMUM_JWT_SECRET_LENGTH ||
    PLACEHOLDER_SECRET.test(jwtSecret)
  ) {
    throw new Error(
      `JWT_SECRET must be a non-placeholder secret of at least ${MINIMUM_JWT_SECRET_LENGTH} characters in production`,
    );
  }

  const refreshSecret = environment.JWT_REFRESH_SECRET;
  if (
    !refreshSecret ||
    refreshSecret.length < MINIMUM_JWT_SECRET_LENGTH ||
    PLACEHOLDER_SECRET.test(refreshSecret)
  ) {
    throw new Error(
      `JWT_REFRESH_SECRET must be a non-placeholder secret of at least ${MINIMUM_JWT_SECRET_LENGTH} characters in production`,
    );
  }
  if (refreshSecret === jwtSecret) {
    throw new Error('JWT_REFRESH_SECRET must differ from JWT_SECRET in production');
  }
}
