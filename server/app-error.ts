class AppError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string) => new AppError(400, message);
export const notFound = (message: string) => new AppError(404, message);
export const payloadTooLarge = (message: string) => new AppError(413, message);
export const serviceUnavailable = (message: string) => new AppError(503, message);

export const toAppError = (error: unknown) => {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof SyntaxError) {
    return badRequest('Invalid JSON body');
  }
  return new AppError(500, 'Internal server error');
};
