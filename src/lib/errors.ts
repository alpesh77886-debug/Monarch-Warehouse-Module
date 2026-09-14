// Shared error classes for API routes / business rules, per the pattern
// already used in the architecture blueprint's own guard examples
// (dispatch-guard.ts, hold-guard.ts, pallet-guard.ts).

export class UnauthorizedError extends Error {
  status = 401 as const;
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  status = 403 as const;
  constructor(message = "You are not authorized for this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends Error {
  status = 422 as const;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  status = 404 as const;
  constructor(message = "Resource not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}
