# Unicode Equation Format

Use these rules when filling `unicode` values in `equation-transcriptions.json`.

## Core Rules

- Use plain Unicode math text, not LaTeX.
- Keep variable names and probability notation exactly as printed.
- Preserve parentheses and operator precedence.
- Do not add explanatory prose inside equation replacements.
- Keep output single-line unless the source equation is clearly multiline.

## Preferred Symbols

- Multiplication: `*` or `×` (stay consistent within a chapter)
- Division: `/`
- Plus/minus: `±`
- Approximately: `≈`
- Not equal: `!=` or `≠`
- Less/greater equal: `<=`/`>=` or `≤`/`≥`
- Sum: `Σ`
- Product: `∏`
- Integral: `∫`
- Infinity: `∞`
- Square root: `√`
- Greek letters: `α β γ δ ε θ λ μ π σ τ φ`

## Superscripts and Subscripts

- Use Unicode superscripts/subscripts when readable: `x²`, `σ²`, `H₀`, `H₁`.
- Fallback to caret/underscore when Unicode is awkward: `x^10`, `theta_i`.
- Keep notation consistent near adjacent equations in the same chapter.

## Probability and Bayesian Notation

- Conditional probability: `P(A|B)`
- Joint probability: `P(A,B)`
- Bayes theorem layout should remain compact:
  - `P(A|B) = P(B|A) * P(A) / P(B)`
- Keep priors/posteriors as printed (for example `P(H)` and `P(H|D)`).

## Validation

After applying replacements:

- `rg -n "\\[EQN_IMAGE:" library/references/bayesian-stats/*.txt` must return no matches.
- Read nearby lines around replaced equations to ensure they still parse in context.
