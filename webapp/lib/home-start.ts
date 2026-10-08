/** The first-run checklist on Home. Pure: the page passes in counts from the database. */
export interface StartCounts { accounts: number; pockets: number; assignments: number; transactions: number }
export interface StartStep { key: string; title: string; detail: string; href: string; action: string; done: boolean }

export function startSteps(c: StartCounts, q = ""): StartStep[] {
  return [
    { key: "account", title: "Add an account", detail: "Where your money actually lives: checking, savings, a card, or cash in hand.", href: `/accounts${q}`, action: "Add account", done: c.accounts > 0 },
    { key: "pockets", title: "Look over your pockets", detail: "Pockets are jobs for your money, like groceries or rent. We start you with a few. Rename them or add your own.", href: `/budget${q}`, action: "See pockets", done: c.pockets > 0 },
    { key: "assign", title: "Give your money a job", detail: "Money you add lands in the pool. Move some of it into a pocket so it has a purpose.", href: `/budget${q}`, action: "Assign money", done: c.assignments > 0 },
    { key: "tx", title: "Record your first transaction", detail: "Use the + button to log something you spent or received. It takes about ten seconds.", href: `/accounts${q}`, action: "Add one", done: c.transactions > 0 },
  ];
}

export function startProgress(steps: StartStep[]): { done: number; total: number; complete: boolean } {
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, complete: done === steps.length };
}
