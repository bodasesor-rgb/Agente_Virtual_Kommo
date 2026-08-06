export type GuardEffects = {
  appliedDirectReply?: boolean;
  appliedSalesReply?: boolean;
};

export type GuardDecision =
  | { kind: "continue" }
  | { kind: "reply"; id: string; mensaje: string; effects?: GuardEffects };

export type GuardHandler<Context> = (ctx: Context) => GuardDecision;

export function runGuardHandlers<Context>(
  ctx: Context,
  handlers: readonly GuardHandler<Context>[]
): GuardDecision {
  for (const handler of handlers) {
    const decision = handler(ctx);
    if (decision.kind === "reply") return decision;
  }
  return { kind: "continue" };
}
