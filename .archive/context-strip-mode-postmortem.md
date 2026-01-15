# Context Strip Mode: Implementation Postmortem

**Date:** January 2026
**Status:** Feature abandoned after multiple implementation attempts

## Original Goal

Implement a "Context Strip Mode" for the speed reader that would show:
- Previous chunks dimmed on the left
- Current chunk with highlighted OVP (Optimal Viewing Point) in the center
- Next chunks dimmed on the right
- Smooth sliding animation as text moves left when advancing

The motivation was to provide surrounding context while reading, creating a "window sliding over continuous text" experience similar to physical speed reading tools.

## Approaches Attempted

### 1. Transform-Based Animation

**Approach:** Render multiple chunks in a horizontal strip, use CSS `transform: translateX()` to slide the strip so the current chunk's OVP stays centered.

**Problem:** Race condition between React state updates and DOM measurements. The sequence was:
1. Chunk index changes → React re-renders
2. `useLayoutEffect` fires and measures NEW OVP position
3. Calculate and set new transform offset
4. Brief frame where old offset applies to new layout → visual "snap back"

**Result:** Jarring back-and-forth animation that made reading impossible.

### 2. Native Browser Scroll

**Approach:** Use a horizontally scrollable container with hidden scrollbars. Let the browser handle animation via `scrollTo({ behavior: 'smooth' })`.

**Problem:** While the scroll animation itself was smooth, there was a perceived "oscillation" effect due to variable chunk lengths:
- Short chunk "the" has OVP near left edge
- Long chunk "understanding" has OVP more centered
- Even with OVP perfectly centered, the *edges* of text appear to jump

**Result:** Users perceived back-and-forth movement even though the center point was stable.

### 3. Fixed-Width Cells

**Approach:** Wrap each chunk in a fixed-width container (based on mode's character target). Use CSS grid to center the OVP within each cell. Scroll by exactly one cell width each time.

**Problem:**
- Created huge gaps between short chunks
- Text got cut off in cells that were too narrow
- Spacing between chunks was completely broken
- Visual appearance was jarring and unnatural

**Result:** Completely unusable layout.

### 4. Instant Replacement with Context

**Approach:** No animation at all. Just show previous/next chunks as dimmed text appended to the before/after sections of the existing grid layout.

**Problem:**
- Context text + current chunk exceeded container width, causing overflow
- Even with `overflow: hidden`, text appeared to overlap at the boundaries
- Spacing between context and current chunk was inconsistent
- The grid layout that works for single chunks doesn't scale to continuous text

**Result:** Text overlapping and spacing issues made it unreadable.

## Why This Is Hard

### The Fundamental Tension

RSVP (Rapid Serial Visual Presentation) works by keeping the reader's eyes fixed on a single point while text changes. The key insight is that eye movement is slow - by eliminating saccades, you can read faster.

**Single-word RSVP** achieves this perfectly:
- OVP character stays at exact same screen position
- Text simply appears/disappears
- No eye movement required

**Context strip mode** tries to have it both ways:
- Show surrounding text (requires horizontal space)
- Keep OVP fixed (requires centering logic)
- Animate smoothly (requires coordinating position changes)

These goals conflict because:
1. Variable chunk lengths mean variable distances between OVPs
2. Any animation reveals this variability as perceived movement
3. Compensating for variability (fixed-width cells) creates other visual problems

### CSS/DOM Measurement Challenges

Web browsers aren't designed for this kind of synchronized animation:
- React's render cycle creates timing gaps where measurements are stale
- `getBoundingClientRect()` returns current positions including transforms
- CSS transitions and JS state updates don't coordinate perfectly
- Monospace fonts help but `ch` units aren't perfectly consistent

### The Spritz Solution

Successful RSVP apps (Spritz, Spreeder, etc.) solved this by NOT animating:
- Single chunk displayed at fixed position
- Instant replacement, no transition
- OVP character literally never moves
- Some show a static "ghost" of previous word, but no animation

## Lessons Learned

1. **Animation in RSVP is an anti-pattern.** The whole point is to eliminate eye movement. Animation introduces movement.

2. **Variable-width content + centered positioning + animation = visual instability.** You can pick two, but not all three.

3. **DOM measurement timing is tricky.** React's lifecycle and browser rendering don't synchronize perfectly for smooth animation.

4. **The existing single-mode works well.** The grid layout with `1fr auto 1fr` keeps the OVP perfectly centered for any chunk length.

5. **Physical speed reading tools work differently.** A card with a window moving over paper has constant velocity and fixed window size - the text underneath is what it is. Digital RSVP has discrete chunks of varying length.

## Potential Future Approaches (If Revisited)

1. **Static context display:** Show previous/next chunks in separate areas (above/below the main display) without animation. Just update them instantly.

2. **Constant-velocity scroll:** Instead of chunk-based advancement, scroll at a fixed pixels-per-second rate. Current word is whatever's in the center. Loses WPM precision but eliminates the centering problem.

3. **Canvas rendering:** Bypass DOM entirely. Pre-render all text positions, animate by drawing to canvas. Full control over timing and positioning.

4. **Accept the oscillation:** Use the scroll approach but accept that users will perceive some movement. Some might find it acceptable after adjustment.

## Conclusion

The original single-word/phrase RSVP mode with instant replacement and centered OVP remains the best approach for this application. The context strip mode, while conceptually appealing, introduces visual instability that undermines the core speed reading experience.

The feature has been removed from the codebase. This document serves as a record of what was attempted and why it was abandoned.
