export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function notFound(message = "Not found") {
  return new HttpError(404, message);
}
