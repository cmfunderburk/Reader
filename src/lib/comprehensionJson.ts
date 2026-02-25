export function extractFallbackJsonSnippet(rawResponse: string): string {
  const trimmed = rawResponse.trim();
  if (!trimmed) {
    throw new Error('LLM response was empty');
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error('LLM response did not contain JSON');
}

export function parseRawJsonObject(rawResponse: string): Record<string, unknown> {
  const trimmed = rawResponse.trim();
  if (!trimmed) {
    throw new Error('LLM response was empty');
  }

  let parsed: unknown;
  try {
    // Schema-driven calls should return direct JSON; parse this path first.
    parsed = JSON.parse(trimmed);
  } catch {
    const fallbackText = extractFallbackJsonSnippet(rawResponse);
    try {
      parsed = JSON.parse(fallbackText);
    } catch {
      throw new Error('LLM response JSON was invalid');
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('LLM response JSON must be an object');
  }

  return parsed as Record<string, unknown>;
}
