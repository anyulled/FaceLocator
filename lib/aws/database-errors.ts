type DatabaseErrorKind = "configuration" | "connectivity" | "query";

type DatabaseErrorContext = Record<string, unknown>;

type DatabaseOperationOptions<T> = {
  operation: string;
  label?: string;
  context?: DatabaseErrorContext;
  handler: () => Promise<T>;
};

type DatabaseErrorConstructorOptions = {
  operation: string;
  kind: DatabaseErrorKind;
  status: number;
  message: string;
  troubleshooting: string;
  context?: DatabaseErrorContext;
  cause?: unknown;
  details?: Record<string, unknown>;
};

const CONNECTIVITY_CODES = new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "ECONNRESET",
]);

const QUERY_CODES = new Set([
  "23505",
  "23503",
  "42P01",
  "42703",
  "42601",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasDatabaseErrorShape(error: unknown) {
  if (!isObject(error)) {
    return false;
  }

  return (
    "code" in error ||
    "errno" in error ||
    "syscall" in error ||
    "address" in error ||
    "port" in error ||
    "severity" in error ||
    "detail" in error ||
    "hint" in error
  );
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function summarizeCause(error: unknown) {
  if (!isObject(error)) {
    return {
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    name: readString(error.name),
    message: readString(error.message),
    code: readString(error.code),
    errno: typeof error.errno === "number" ? error.errno : undefined,
    syscall: readString(error.syscall),
    address: readString(error.address),
    port: typeof error.port === "number" ? error.port : undefined,
    severity: readString(error.severity),
    schema: readString(error.schema),
    table: readString(error.table),
    constraint: readString(error.constraint),
    detail: readString(error.detail),
    hint: readString(error.hint),
  };
}

function classifyDatabaseError(error: unknown): {
  kind: DatabaseErrorKind;
  status: number;
  message: string;
  troubleshooting: string;
} {
  const code = isObject(error) ? readString(error.code) : undefined;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (code && (CONNECTIVITY_CODES.has(code) || code.startsWith("57P") || code === "53300")) {
    return {
      kind: "connectivity",
      status: 503,
      message: "Database connection failed.",
      troubleshooting:
        "Check private RDS reachability, security groups, subnet routes, the database secret, and whether the instance is healthy.",
    };
  }

  if (
    code === "28P01" ||
    code === "3D000" ||
    message.includes("password authentication failed") ||
    message.includes("role") && message.includes("does not exist")
  ) {
    return {
      kind: "configuration",
      status: 500,
      message: "Database configuration is unavailable.",
      troubleshooting:
        "Check the database secret name, host, database name, username, and password stored in Secrets Manager.",
    };
  }

  if (code && QUERY_CODES.has(code)) {
    return {
      kind: "query",
      status: 500,
      message: "Database query failed.",
      troubleshooting:
        "Check the SQL statement, schema, and expected table or column names.",
    };
  }

  if (message.includes("timeout") || message.includes("connection") || message.includes("network")) {
    return {
      kind: "connectivity",
      status: 503,
      message: "Database connection failed.",
      troubleshooting:
        "Check private RDS reachability, security groups, subnet routes, the database secret, and whether the instance is healthy.",
    };
  }

  return {
    kind: "query",
    status: 500,
    message: "Database query failed.",
    troubleshooting:
      "Check the SQL statement, schema, and expected table or column names.",
  };
}

export class DatabaseOperationError extends Error {
  public readonly operation: string;

  public readonly kind: DatabaseErrorKind;

  public readonly status: number;

  public readonly troubleshooting: string;

  public readonly context: DatabaseErrorContext;

  public readonly details: Record<string, unknown>;

  public readonly cause?: unknown;

  constructor(options: DatabaseErrorConstructorOptions) {
    super(options.message);
    this.name = "DatabaseOperationError";
    this.operation = options.operation;
    this.kind = options.kind;
    this.status = options.status;
    this.troubleshooting = options.troubleshooting;
    this.context = options.context ?? {};
    this.details = options.details ?? {};
    this.cause = options.cause;
  }
}

export function isDatabaseOperationError(error: unknown): error is DatabaseOperationError {
  return error instanceof DatabaseOperationError;
}

export function isDatabaseErrorLike(error: unknown) {
  return isDatabaseOperationError(error) || hasDatabaseErrorShape(error);
}

export function describeDatabaseError(error: unknown, label?: string) {
  if (error instanceof DatabaseOperationError) {
    return {
      operation: error.operation,
      kind: error.kind,
      status: error.status,
      message: error.message,
      troubleshooting: error.troubleshooting,
      context: error.context,
      details: error.details,
    };
  }

  const classification = classifyDatabaseError(error);
  const readableLabel = label ? `while ${label}` : "";

  return {
    operation: "database.unknown",
    kind: classification.kind,
    status: classification.status,
    message: `${classification.message} ${readableLabel}`.trim(),
    troubleshooting: classification.troubleshooting,
    context: {},
    details: summarizeCause(error),
  };
}

export function wrapDatabaseError(
  operation: string,
  error: unknown,
  context?: DatabaseErrorContext,
  label?: string,
): DatabaseOperationError {
  if (error instanceof DatabaseOperationError) {
    return error;
  }

  const classification = classifyDatabaseError(error);
  const causeSummary = summarizeCause(error);
  const readableLabel = label ?? operation;

  return new DatabaseOperationError({
    operation,
    kind: classification.kind,
    status: classification.status,
    troubleshooting: classification.troubleshooting,
    context,
    cause: error,
    details: causeSummary,
    message: `${classification.message} while ${readableLabel}. Troubleshooting: ${classification.troubleshooting}`,
  });
}

export async function runDatabaseOperation<T>({
  operation,
  label,
  context,
  handler,
}: DatabaseOperationOptions<T>): Promise<T> {
  try {
    return await handler();
  } catch (error) {
    throw wrapDatabaseError(operation, error, context, label);
  }
}
