export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
export function errorStatus(error: unknown): number {
  return error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 500;
}

export function diagnosticCode(error: unknown): string {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)) return error.code;
  if (error instanceof Error && /timeout|timed out/i.test(error.message)) return 'TIMEOUT';
  return 'UNKNOWN';
}

export function apiError(error: unknown): { error: string; code: string; status: number } {
  if (error instanceof SyntaxError) return { error: 'Invalid request.', code: 'INVALID_REQUEST', status: 400 };
  const status = errorStatus(error);
  if (status >= 400 && status < 500) return { error: errorMessage(error), code: 'REQUEST_REJECTED', status };
  const code = diagnosticCode(error);
  if (['42P01', 'P2021', 'P2022'].includes(code)) return { error: 'The chat database has not been set up yet.', code: 'DATABASE_NOT_INITIALIZED', status: 503 };
  if (['TIMEOUT', 'ETIMEDOUT', 'EACCES', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', '57P03', '53300', 'P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2028'].includes(code)) {
    return { error: 'Cannot connect to the chat database. Please try again shortly.', code: 'DATABASE_UNAVAILABLE', status: 503 };
  }
  return { error: 'The chat service could not complete your request. Please try again.', code: 'INTERNAL_ERROR', status: 500 };
}
