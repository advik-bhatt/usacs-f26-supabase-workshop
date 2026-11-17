// Grading lives on the server so nobody can grade their own pizza.

export type Order = { size: string; toppings: string[] };

export type Grade = {
  correct: boolean;
  score: number;
  tipCents: number;
  missing: string[];
  extra: string[];
};

export function grade(order: Order, plate: Order, seconds: number): Grade {
  const want = new Set(order.toppings);
  const got = new Set(plate.toppings);

  const missing = [...want].filter((t) => !got.has(t));
  const extra = [...got].filter((t) => !want.has(t));
  const rightSize = order.size === plate.size;
  const correct = rightSize && missing.length === 0 && extra.length === 0;

  if (!correct) {
    // a wrong pizza still costs the kitchen, and nobody tips for it
    return { correct, score: 0, tipCents: 0, missing, extra };
  }

  // 10 for getting it right, up to 5 more for being quick about it
  const speed = Math.max(0, 5 - Math.floor(seconds / 4));
  const score = 10 + speed;
  // tips are small next to the price of the pizza; the money is in getting it right
  const tipCents = speed * 15;

  return { correct, score, tipCents, missing, extra };
}
