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

// NS-011 (concurrent dual-confirmation race), NS-012 (duplicate receiving
// sheet) - a real conflict with existing state, distinct from a plain
// validation failure (422): the request is well-formed, but the resource
// it targets already exists or has already moved on.
export class ConflictError extends Error {
  status = 409 as const;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

// Loop 21 finding: distinct from UnauthorizedError (401, "no session
// presented") - this means the auth backend itself cannot verify any
// session at all yet (Clerk stub mode has no real login, so nobody -
// not even an admin - can be authenticated). Callers must not treat
// this as "not logged in, please log in"; there is no login to
// perform until a real Clerk application is configured.
export class AuthNotConfiguredError extends Error {
  status = 503 as const;
  constructor(
    message = "Authentication is not configured yet (Clerk stub mode). No action requiring a role check can be authorized until a real Clerk application is connected."
  ) {
    super(message);
    this.name = "AuthNotConfiguredError";
  }
}
