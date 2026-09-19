/** Shared confirmation boundary: never treat a fulfilled promise as a successful write. */
export type ActionStatus = "idle" | "pending" | "success" | "error";
export type ActionOutcome = { ok: true } | { ok: false; error: string };
export const ACTION_ERROR =
  "The action couldn't be completed. Please try again.";

export async function confirmedAction(
  action: () => Promise<unknown>,
): Promise<ActionOutcome> {
  try {
    const result = await action();
    if (result && typeof result === "object") {
      if (
        "error" in result &&
        typeof result.error === "string" &&
        result.error
      ) {
        return { ok: false, error: result.error };
      }
      if ("ok" in result && result.ok === true) return { ok: true };
    }
    return { ok: false, error: ACTION_ERROR };
  } catch {
    return { ok: false, error: ACTION_ERROR };
  }
}
