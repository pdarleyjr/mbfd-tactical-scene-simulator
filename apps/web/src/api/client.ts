export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  token?: string | undefined
  body?: unknown
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { token, body, ...requestOptions } = options
  const headers = new Headers(requestOptions.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const isFormData = body instanceof FormData
  if (body !== undefined && !isFormData) headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')
  const response = await fetch(path, {
    ...requestOptions,
    headers,
    ...(body === undefined ? {} : { body: isFormData ? body : JSON.stringify(body) }),
  })
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new ApiError(data.error ?? `Request failed with status ${response.status}.`, response.status)
  return data as T
}
