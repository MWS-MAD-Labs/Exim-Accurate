// Why a call to Central (or Hub) did not work, in the three ways that matter to what comes next:
//   unreachable  the network, a timeout or a 5xx: it may work a minute later, so ask again
//   missing      404: that Central does not have the endpoint yet (it is deployed after this app)
//   rejected     the answer was no (token, scope, a list that is not allowed): asking again changes nothing
export type CentralFailure = "unreachable" | "missing" | "rejected";

export class CentralError extends Error {
  constructor(
    message: string,
    public readonly kind: CentralFailure,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "CentralError";
  }
}

export function failureForStatus(status: number): CentralFailure {
  if (status === 404) return "missing";
  if (status >= 500 || status === 408 || status === 429) return "unreachable";
  return "rejected";
}

// The message people read in logs and on the page.
export function describeFailure(kind: CentralFailure, detail?: string): string {
  if (kind === "unreachable") return "Central could not be reached";
  if (kind === "missing") return "Central does not have this yet, deploy Central first";
  return detail ? `Central said no: ${detail}` : "Central said no";
}

export function errorForResponse(status: number, serverMessage?: string | null): CentralError {
  const kind = failureForStatus(status);
  return new CentralError(describeFailure(kind, serverMessage ?? undefined), kind, status);
}

export function errorForNetwork(error: unknown): CentralError {
  const detail = error instanceof Error ? error.message : String(error);
  return new CentralError(`${describeFailure("unreachable")} (${detail})`, "unreachable");
}

export function isUnreachable(error: unknown) {
  return error instanceof CentralError && error.kind === "unreachable";
}
