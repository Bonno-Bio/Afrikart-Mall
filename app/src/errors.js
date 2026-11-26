/**
 * Errors that reach the customer.
 *
 * Every non-2xx response carries the same envelope (docs/spec/api-contract.md):
 *   { error: { code, message, field?, request_id } }
 *
 * Codes are stable strings. The UI switches on the code, never on the message.
 */
export class AppError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.field = extra.field ?? null;
    this.details = extra.details ?? null;
  }

  toJSON(requestId) {
    const error = { code: this.code, message: this.message };
    if (this.field) error.field = this.field;
    if (this.details) error.details = this.details;
    if (requestId) error.request_id = requestId;
    return { error };
  }
}

export const badRequest = (code, message, extra) => new AppError(400, code, message, extra);
export const unauthorized = (message = 'Sign in first.') => new AppError(401, 'UNAUTHORISED', message);
export const forbidden = (message = 'Not allowed.') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found.') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code, message, extra) => new AppError(409, code, message, extra);
export const unprocessable = (code, message, extra) => new AppError(422, code, message, extra);
