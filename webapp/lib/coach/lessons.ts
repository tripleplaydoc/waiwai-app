export interface Lesson { id: string; title: string; body: string; action: string }

/** Short lessons shown in the Money Meeting. The trigger picks the one that fits this week. */
export const LESSONS: Record<string, Lesson> = {
  assign: { id: "assign", title: "Give every dollar a job", body: "Money sitting in Ready to Assign has no purpose yet, so it tends to drift into spending. Assigning is deciding, ahead of time, what each dollar is for: recurring flows first, then savings, then choices.", action: "Assign what is left in Ready to Assign before the week ends." },
  overspent: { id: "overspent", title: "Overspending is information", body: "A pocket in the red means the plan did not match reality. It is not a failure. Move money from a pocket you did not need this month, so the plan stays honest and the account balances still match.", action: "Cover each red pocket by moving from one with room." },
  review: { id: "review", title: "Untyped means unclaimed", body: "Every expense without a Type is a deduction the tax return cannot see. Five minutes a week keeps a year of receipts from becoming a weekend of digging.", action: "Clear the review queue." },
  subs: { id: "subs", title: "Small leaks sink big boats", body: "A charge you stopped noticing still costs twelve times a year. Cancelling, downgrading or negotiating one recurring flow pays back every month with no further effort, which no one-time saving does.", action: "Pick the one recurring charge you use least and cancel or negotiate it." },
  creep: { id: "creep", title: "Prices creep quietly", body: "Companies raise prices a little and count on you not looking. A call asking to be moved back to the old rate or the promotional plan works more often than people expect.", action: "Call about the biggest price increase using the script in the Leak finder." },
  tax: { id: "tax", title: "Pay the right tax, not extra", body: "Taxes are your largest expense. Legal levers, such as tracking every deductible expense, the home office and mileage, work only if the records exist before the year ends.", action: "Open Tax levers and check the year-end list." },
  runway: { id: "runway", title: "Runway is freedom", body: "Cash runway is how long you could live without new income. The first goal is 90 days. Every extra month buys you the power to say no to a bad deal.", action: "Move a set amount into savings this week, even a small one." },
  rate: { id: "rate", title: "Savings rate beats income", body: "How much you keep matters more than how much you make. Raising your savings rate by 5 points does more for your freedom than a 5% raise you then spend.", action: "Choose one number to keep from each income deposit, and assign it first." },
  steady: { id: "steady", title: "Boring is the goal", body: "When the numbers match, nothing is overspent and the queue is empty, the system is working. Master of money mostly means repeating a few simple weekly habits.", action: "Look at Growth numbers and choose one thing to improve this month." },
};

export function pickLesson(c: { rtaCents: number; overspent: number; review: number; creeping: number; subs: number; runway: number | null; rate: number | null }): Lesson {
  if (c.overspent > 0) return LESSONS.overspent;
  if (c.rtaCents > 0) return LESSONS.assign;
  if (c.review > 0) return LESSONS.review;
  if (c.creeping > 0) return LESSONS.creep;
  if (c.runway !== null && c.runway < 90) return LESSONS.runway;
  if (c.rate !== null && c.rate < 10) return LESSONS.rate;
  if (c.subs > 0) return LESSONS.subs;
  return LESSONS.steady;
}
