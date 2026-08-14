export type ErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;

  constructor(code: ErrorCode, httpStatus: number, message: string) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.name = 'AppError';
  }
}

export function badRequest(message: string): AppError {
  return new AppError('BAD_REQUEST', 400, message);
}

export function notFound(message: string): AppError {
  return new AppError('NOT_FOUND', 404, message);
}

export function conflict(message: string): AppError {
  return new AppError('CONFLICT', 409, message);
}

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
  };
}

export function toErrorBody(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof AppError) {
    return {
      status: err.httpStatus,
      body: { error: { code: err.code, message: err.message } },
    };
  }
  return {
    status: 500,
    body: { error: { code: 'INTERNAL', message: 'Internal server error' } },
  };
}
