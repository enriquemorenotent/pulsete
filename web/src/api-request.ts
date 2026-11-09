export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export class ApiResponseError extends Error {
  constructor(cause: unknown) {
    super('The server returned an unreadable JSON response.', { cause });
    this.name = 'ApiResponseError';
  }
}

// Leave successful bodies untouched so callers can stream or download them.
export async function requestResponse(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, init);
  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    const message = body && typeof body === 'object' && 'message' in body
      && typeof body.message === 'string' && body.message.trim()
      ? body.message : `Request failed (${response.status})`;
    throw new ApiRequestError(message, response.status);
  }
  return response;
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch (error) {
    // Preserve cancellation and transport failures instead of disguising them.
    if (!(error instanceof SyntaxError)) throw error;
    throw new ApiResponseError(error);
  }
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (typeof init?.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return readJsonResponse<T>(await requestResponse(path, { ...init, headers }));
}
