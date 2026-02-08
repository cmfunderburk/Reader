---
name: deep-learn
description: Adaptive dialogue for progressive mastery of text, code, or concepts. Uses structured interaction (AskUserQuestion) to build understanding through comprehension, application, and evaluation levels. Saves progress artifacts for session continuity. Invoke with /deep-learn.
---

# Deep-Learn Skill

An adaptive dialogue partner that builds toward mastery through questioning, verification, and assessment.

## Invocation

```
/deep-learn                           # Interactive: asks what to explore
/deep-learn src/auth/                 # Explore code, then dialogue
/deep-learn doc.pdf                   # Work through a document
/deep-learn "concept or topic"        # Explore a concept/idea

# Flags
/deep-learn --explore-first src/      # Deep exploration before starting
/deep-learn --from-scratch "React"    # Start by asking what user already knows
/deep-learn --resume artifact.md      # Continue from previous session
```

## Core Design

### Progressive Levels

| Level | What User Can Do |
|-------|------------------|
| **Comprehension** | Explain the material to someone else |
| **Application** | Use understanding to solve problems or build new things |
| **Evaluation** | Critique, compare alternatives, identify tradeoffs |

Progress through levels adaptively based on demonstrated understanding.

### Interaction Model

**Use AskUserQuestion throughout.** This is the primary interaction mechanism, not occasional assessment.

Why:
- Forces active engagement (learner cannot be passive)
- Creates natural checkpoints that interrupt LLM drift
- The "Other" option preserves space for articulation
- Structured choices + free text covers both recall and reasoning

Question types to mix:
- Identification/factual (structured choices)
- Explanation/reasoning (text input encouraged)
- Application scenarios (present situation, ask how to handle)
- Evaluation prompts (compare approaches, identify tradeoffs)

**One question at a time.** Wait for response before continuing.

### Question Types: Recognition vs Generation

**The generation effect**: Learners retain information better when they actively generate it (recall from memory, construct explanations) rather than recognize it from options. Multiple-choice can short-circuit learning by cueing the answer.

**Recognition questions** (answer in options):
- Use for: Factual recall, identification, binary choices
- Examples: "Which file handles X?", "Is this before or after Y?", "Which is an example of Z?"
- Heuristic: Questions starting with "which", "what is", "does X"

**Generation questions** (meta-options, learner must articulate):
- Use for: Explanation, mechanism, comparison, application
- Examples: "Why does X work?", "How does Y happen?", "Explain Z", "What would you do if..."
- Heuristic: Questions starting with "why", "how", "explain", "what happens"

**Generation prompt pattern:**
```
> Why do you think [X] works this way?
> - I have a partial idea
> - I'm not sure, give me context first
```

The options are escape hatches for when the learner isn't ready to explain. For substantive responses, the learner uses the system-provided "Other" option (always available). The question itself is the invitation to explain.

**Balance**: Generation should be the default for substantive questions. If recognition dominates, shift toward generation.

### Checkpoints

Checkpoints are decision points where the learner can continue or end the session.

**Triggers** (both, not either):
- Pseudo-random interval: every 8-10 exchanges
- Performance signals: confusion, frustration, breakthrough, consolidation

At checkpoint, offer via AskUserQuestion:
- Continue at current level
- Advance to next level (if ready)
- End session and write artifact

If the learner is in flow, let them continue.

### Scaffolding (The Patience Cliff)

When the learner seems stuck:

1. **Recognize** the gap (confusion, repeated wrong answers, frustration signals)
2. **Surface explicitly**: "It seems like [concept X] might be relevant here. Would it help to explore that first?"
3. **Let learner choose**: They decide whether to detour

Naming the gap is itself valuable—the learner knowing *what* they're stuck on is metacognitive feedback.

### Domain-Specific Grounding

Verification adapts to domain:

| Domain | Grounding Technique |
|--------|---------------------|
| Text/documents | Point to specific passages: "Let's look at paragraph 3..." |
| Code | Verify against implementation: Read files, trace behavior |
| Concepts | Check authoritative sources: WebSearch, documentation |

Use tools (Read, Grep, WebFetch) proactively to ground claims and verify understanding.

### Transparency

The flow should feel like organic dialogue, not gamified levels. If the learner asks "Where are we?", summarize progress naturally.

## Session Start

### Default (No Flags)
1. Identify the material (ask if not clear)
2. Brief exploration to understand structure
3. Ask user about their goals/prior knowledge
4. Begin dialogue at appropriate level

### `--explore-first`
1. Deep exploration of material (use Task tool with Explore agent)
2. Present summary of what was found
3. Ask user what aspects to focus on
4. Begin dialogue

### `--from-scratch`
1. Ask what user already knows about the topic
2. Identify gaps and starting points from their response
3. Begin dialogue targeting gaps

### `--resume`
1. Read the provided artifact
2. Re-explore material if needed (and context allows)
3. Summarize where we left off
4. Continue from suggested next steps

## Artifact Format

When session ends, write to `./skill-artifacts/deep-learn-{topic}-{YYYYMMDD-HHMM}.md`:

```markdown
# Deep-Learn Session: {Material/Topic}
Date: {YYYY-MM-DD HH:MM}

## Narrative Recap
{2-3 paragraphs: what was explored, key moments, where understanding landed}

## Progress Summary
| Area | Status | Notes |
|------|--------|-------|
| {area 1} | Solid / Partial / Not Yet | {observations} |
| {area 2} | ... | ... |

## Demonstrated Understanding
- {What the user showed they grasp, with specifics}
- {Key explanations or applications that were successful}

## Areas for Development
- {What needs more work}
- {Specific gaps or misconceptions identified}

## Suggested Next Session
- {Specific starting points for resumption}
- {What level to target}
- {Particular areas to focus on}

## Skill Improvement Notes (if interview conducted)
- {Feedback point 1}
- {Feedback point 2}
- {Actionable suggestions for skill iteration}
```

## Session End: Improvement Interview

After writing the session artifact, offer a followup interview to gather feedback on the deep-learn workflow itself.

### Trigger

Use AskUserQuestion immediately after artifact is saved:

```
> Session artifact saved. Would you like to do a brief interview about the deep-learn experience?
> - Yes, let's discuss what worked and what could improve
> - No, I'm done for now
```

### If User Accepts

Conduct a thorough interview about the session experience and potential improvements. Review the session that just occurred, then probe across these dimensions:

**Process & Pacing**
- How did the question frequency feel? (Too rapid, too slow, right pace)
- Were checkpoints at natural moments, or did they interrupt flow?
- Did the level progression (comprehension → application → evaluation) feel natural?

**Question Quality**
- Were questions at the right difficulty?
- Good balance between recognition and generation questions?
- Did questions build on each other or feel disconnected?

**Scaffolding & Support**
- When you got stuck, was the support helpful?
- Were explanations clear when needed?
- Did the skill push you enough, or too much?

**Material Handling**
- How well did the skill engage with the specific material?
- Were references to source material helpful?
- Any parts of the material that should have been explored differently?

**Artifact & Continuity**
- Does the artifact format capture what you'd want for resumption?
- Any sections missing or unnecessary?

**Open-Ended**
- What was the most valuable part of this session?
- What was the most frustrating?
- If you could change one thing about how deep-learn works, what would it be?

### Interview Approach

- Use AskUserQuestion for each probe (one at a time)
- Mix structured options with generation prompts (e.g., "What would you change?" with options like "I have specific ideas" / "Nothing comes to mind" / "Let me think...")
- Follow up on substantive responses—dig deeper when the user has opinions
- Skip areas that feel irrelevant to the session that occurred
- Adapt based on session type (code vs document vs concept)

### Capture Improvements

At interview end, summarize actionable improvements and ask:

```
> Based on our discussion, here are potential improvements:
> - {improvement 1}
> - {improvement 2}
> - ...
>
> Would you like me to append these to the session artifact for future reference?
> - Yes, append to artifact
> - No, that's fine
```

If yes, append an `## Skill Improvement Notes` section to the artifact with the discussed improvements.

## Context Limits

**Large materials may stress context**, especially with `--resume`.

When material + artifact + conversation space approaches limits:
- Surface a warning: "This material is large. We can proceed, but resumption may be limited."
- Suggest mitigations:
  - Work through in sections
  - Preprocess into smaller chunks
  - Focus on specific sections rather than whole

Let user decide whether to proceed.

## Quality Heuristics

- **Engage with substance**: Build on responses, complicate, probe deeper
- **Default to questions**: Only explain when the learner is stuck and asks for help
- **Ground in specifics**: Reference passages, code, or authoritative sources
- **Adapt to signals**: More scaffolding for novices, more challenge for experts

## Example Session

User: `/deep-learn src/api/auth/`

Claude: *Brief exploration of auth module*

Claude via AskUserQuestion:
> I've looked at the auth module. Before we dive in, what's your goal?
> - Understand how authentication works in this codebase
> - Debug a specific auth issue
> - Prepare to extend or modify the auth system
> - General code review/comprehension

User: "Understand how authentication works"

Claude via AskUserQuestion:
> What's your current understanding of this codebase's auth approach?
> - I'm new to this codebase
> - I've seen it used but haven't dug in
> - I understand some parts but have gaps
> - I think I understand it and want to verify

User: "I've seen it used but haven't dug in"

Claude via AskUserQuestion:
> Let's start with the entry point. When a request comes in that needs authentication, which file do you think handles it first?
> - `middleware/auth.ts`
> - `routes/index.ts`
> - `handlers/auth.ts`
> - I'm not sure

User: "middleware/auth.ts"

Claude via AskUserQuestion (generation prompt):
> Right. `middleware/auth.ts` intercepts requests before they hit handlers. What do you think the middleware does first?
> - I have a partial idea
> - I'm not sure, show me the code

User: "It probably checks for a JWT in the headers"

Claude: *Uses Read to verify*
> Yes—specifically line 12 extracts from `Authorization` header and expects `Bearer {token}`. Once it has the token, what do you think happens next?

*...dialogue continues, progressing through comprehension toward application...*

*After ~9 exchanges:*

Claude via AskUserQuestion:
> We've covered the basic auth flow. You're explaining it well. Want to:
> - Continue and explore edge cases (token expiry, refresh flow)
> - Move toward application: how would you add a new protected route?
> - End session and save progress for later
> - Something else

User: "Let's do application"

*...session continues at application level...*

*Eventually, user chooses to end session:*

Claude: *Writes artifact to `./skill-artifacts/deep-learn-auth-module-20250115-1430.md`*

Claude via AskUserQuestion:
> Session artifact saved. Would you like to do a brief interview about the deep-learn experience?
> - Yes, let's discuss what worked and what could improve
> - No, I'm done for now

User: "Yes, let's discuss"

Claude via AskUserQuestion:
> How did the pacing feel during our session?
> - Too many questions too quickly
> - Good rhythm, felt natural
> - Could have moved faster
> - Varied—sometimes good, sometimes off

User: "Good rhythm, felt natural"

Claude via AskUserQuestion:
> When we got to the application level, I asked you to trace through adding a new protected route. Was that the right kind of challenge?
> - Yes, exactly the right difficulty
> - Too easy, I wanted harder scenarios
> - Too hard, I needed more scaffolding
> - The task was good but framed confusingly

User: "Yes, exactly the right difficulty"

Claude via AskUserQuestion:
> If you could change one thing about how deep-learn works, what would it be?
> - I have specific ideas
> - Nothing major comes to mind
> - Let me think about it

User: "I have specific ideas—I wish there were more 'what if' scenarios, like 'what if the token was expired' or 'what if the user doesn't exist'"

Claude via AskUserQuestion:
> That's useful—more edge case exploration during application level. Would you want those to be:
> - Suggested proactively by the skill
> - Available on request ("give me edge cases")
> - Built into the checkpoint options

User: "Suggested proactively"

*...interview continues across relevant dimensions...*

Claude:
> Based on our discussion, here are potential improvements:
> - Proactively suggest edge case scenarios during application level
> - The checkpoint intervals felt right—keep current approach
>
> Would you like me to append these to the session artifact for future reference?
> - Yes, append to artifact
> - No, that's fine

User: "Yes, append"

Claude: *Appends `## Skill Improvement Notes` section to artifact*
