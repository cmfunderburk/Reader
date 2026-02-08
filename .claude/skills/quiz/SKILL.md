---
name: quiz
description: Quiz the user on natural language material (articles, technical books, stories, math). Use when the user wants to test their comprehension or recall of reading material. Invoke with /quiz.
---

# Quiz Skill

You are conducting a comprehension quiz on provided material.

## Invocation

```
/quiz --article [path or URL]     # Academic paper, essay, news article
/quiz --technical [path or URL]   # Technical book, documentation, tutorial
/quiz --story [path or URL]       # Short story, fiction
/quiz --novel [path or URL]       # Novel (may need chapter focus)
/quiz --math [path or URL]        # Mathematical text, proofs, problem sets
```

If no path/URL provided, use content from conversation context.

## Content Loading

1. If a file path is provided, use the Read tool to load it
2. If a URL is provided, use WebFetch to retrieve it
3. If neither, use material already present in the conversation

## Mode-Specific Focus

### --article (default if no mode specified)
Focus on:
- Central thesis or main argument
- Supporting evidence and examples
- Key definitions and terminology
- Logical structure and progression
- Conclusions and implications

Question types: "What is the main argument?", "What evidence supports X?", "How does the author address counterargument Y?"

### --technical
Focus on:
- Core concepts and definitions
- Procedures and processes (steps, order)
- Relationships between concepts
- Practical applications
- Prerequisites and dependencies

Question types: "Define X", "What are the steps for Y?", "How does A relate to B?", "When would you use X vs Y?"

### --story
Focus on:
- Plot events and sequence
- Character motivations and development
- Themes and symbolism
- Narrative techniques
- Setting and atmosphere

Question types: "What motivates character X?", "What does Y symbolize?", "How does the ending connect to the opening?"

### --novel
Same as --story, but:
- Ask about broader character arcs
- Track themes across the work
- May focus on specific chapters if requested

### --math
Focus on:
- Definitions (precise statement)
- Theorem statements (hypotheses and conclusions)
- Proof techniques and key steps
- Problem-solving approaches
- Connections between results

Question types: "State the definition of X", "What are the hypotheses of theorem Y?", "Outline the proof strategy for Z", "Solve this problem"

## Quiz Behavior

1. **Start**: Confirm you've loaded the material and state the mode. Ask if user wants to focus on any particular section.

2. **Question pacing**: Ask ONE question at a time. Wait for response.

3. **Format selection** (per question):
   - **Use AskUserQuestion tool** for:
     - Factual recall (definitions, specific facts, dates, names)
     - Sequence questions (what comes first/next)
     - Identification (which character, which concept)
     - Multiple choice is natural fit
   - **Writing good multiple choice options**:
     - Labels should be short and self-contained (the answer itself)
     - Descriptions are optional tiebreakers, not explanations
     - BAD: label "ERM" with description "Minimizing average loss on training data" (gives away the answer)
     - GOOD: label "Empirical risk minimization" with description "Section 1.2.4" (just a locator)
     - GOOD: label "Ice-albedo feedback" with no description needed
     - For term questions ("What term...", "What does X call..."): show only the term, no description
     - Never let descriptions do the cognitive work — if someone could answer correctly just by reading descriptions, the question tests reading, not recall
   - **Use conversational format** for:
     - Analytical questions (why, how, explain)
     - Interpretive questions (what does X mean, symbolize)
     - Synthesis questions (connect A to B)
     - Open-ended discussion

4. **Feedback**: After each answer, provide brief feedback:
   - If correct: Acknowledge, optionally add context
   - If incorrect: Give the correct answer with explanation
   - If partially correct: Acknowledge what's right, clarify what's missing

5. **Scoring**: Track informally (e.g., "4/5 so far"). Don't be pedantic about scoring.

6. **Pacing**: After 5-7 questions, ask if user wants to continue, shift focus, or wrap up.

7. **Wrap-up**: Summarize performance, highlight areas of strength and areas to revisit.

## Example Session

User: `/quiz --article`
(Article about climate feedback loops already in context)

Claude: "I'll quiz you on this article about climate feedback loops. It covers ice-albedo feedback, water vapor feedback, and carbon cycle feedbacks. Want to focus on a specific section, or cover all three?"

User: "All three"

Claude uses AskUserQuestion:
"Which feedback mechanism is described as a 'positive feedback' that amplifies initial warming?"
- Ice-albedo feedback
- Ocean heat absorption
- Increased cloud cover
- Volcanic aerosol effects

User selects: Ice-albedo feedback

Claude: "Correct. As ice melts, less sunlight is reflected back to space, causing more absorption and further warming.

Next question: Why does the author argue that water vapor feedback is difficult to model accurately?"

(Conversational format for analytical question)

...continues...
