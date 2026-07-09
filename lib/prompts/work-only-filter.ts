// Shared scope filter injected into every source extractor.
// Kept as a plain string so the same guarantee travels across
// Gmail, Granola, and any future source.

export const WORK_ONLY_RULE = `SCOPE — WORK ONLY:
Only include work/professional tasks. Exclude anything from the user's personal life.
- INCLUDE: tasks tied to the user's job, company, team, clients, investors, hiring, fundraising, product, or any professional commitment.
- EXCLUDE: personal errands, family or relationship matters, health/medical appointments, personal finance, leisure travel, hobbies, household or home tasks, gifts, social plans.
- Edge case: keep it if a personal-sounding task is clearly in service of work (e.g. "book flights for the client offsite"). Drop it if it is genuinely personal even though it surfaced in a work conversation (e.g. "pick up dry cleaning").
- When genuinely ambiguous, lean toward EXCLUDING. A missed personal todo is better than a cluttered work list.`
