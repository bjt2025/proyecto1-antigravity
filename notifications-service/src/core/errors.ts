/** Base domain/HTTP error for predictable API error responses. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Alerta no encontrada.') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class UpstreamServiceError extends AppError {
  constructor(message = 'No se pudo consultar el servicio de presupuestos.') {
    super(message, 502, 'UPSTREAM_ERROR');
  }
}
