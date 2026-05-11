Only extract a small set of durable, low-risk memory candidates from explicit user statements.

Rules:
- Extract only explicit information, not guesses.
- Prefer stable preferences, workflow preferences, time preferences, low-risk goals, and long-term constraints.
- Do not turn short-lived mood or temporary state into profile memory.
- Treat one-off plans, same-day arrangements, temporary social context, and casual outings as event candidates.
- Do not rewrite temporary social context into long-term preferences or relationship facts.
- Do not auto-promote sensitive health, mental health, family conflict, finances, exact identity, or location details.
- Normalize each candidate into a short subject and short value.
- Return an empty list when there is no clear candidate.
