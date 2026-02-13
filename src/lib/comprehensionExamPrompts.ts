import type {
  ComprehensionExamPreset,
  ComprehensionDimension,
  ComprehensionExamSection,
  ComprehensionFormat,
  GeneratedComprehensionCheck,
  GeneratedComprehensionQuestion,
} from '../types';

type ExamDifficulty = 'standard' | 'challenging';

export interface ComprehensionExamBlueprint {
  questionCount: number;
  sectionCounts: Record<ComprehensionExamSection, number>;
  standardConstructedMin: number;
  challengingConstructedMin: number;
}

export interface GenerateExamPromptArgs {
  sourceContext: string;
  preset: ComprehensionExamPreset;
  difficultyTarget: ExamDifficulty;
  openBookSynthesis: boolean;
}

export interface ParseGeneratedExamArgs {
  raw: string;
  preset: ComprehensionExamPreset;
  difficultyTarget: ExamDifficulty;
  selectedSourceArticleIds: string[];
}

const COMPREHENSION_DIMENSIONS: ComprehensionDimension[] = ['factual', 'inference', 'structural', 'evaluative'];
const COMPREHENSION_FORMATS: ComprehensionFormat[] = ['multiple-choice', 'true-false', 'short-answer', 'essay'];
const COMPREHENSION_SECTIONS: ComprehensionExamSection[] = ['recall', 'interpretation', 'synthesis'];

const EXAM_BLUEPRINTS: Record<ComprehensionExamPreset, ComprehensionExamBlueprint> = {
  quiz: {
    questionCount: 12,
    sectionCounts: {
      recall: 3,
      interpretation: 5,
      synthesis: 4,
    },
    standardConstructedMin: 5,
    challengingConstructedMin: 6,
  },
  midterm: {
    questionCount: 18,
    sectionCounts: {
      recall: 5,
      interpretation: 8,
      synthesis: 5,
    },
    standardConstructedMin: 7,
    challengingConstructedMin: 9,
  },
  final: {
    questionCount: 24,
    sectionCounts: {
      recall: 6,
      interpretation: 11,
      synthesis: 7,
    },
    standardConstructedMin: 9,
    challengingConstructedMin: 12,
  },
} as const;

function getBlueprint(preset: ComprehensionExamPreset): ComprehensionExamBlueprint {
  return EXAM_BLUEPRINTS[preset];
}

export function getComprehensionExamBlueprint(preset: ComprehensionExamPreset): ComprehensionExamBlueprint {
  return getBlueprint(preset);
}

function extractJsonSnippet(rawResponse: string): string {
  const trimmed = rawResponse.trim();
  if (!trimmed) {
    throw new Error('LLM response was empty');
  }

  if (trimmed.startsWith('{')) return trimmed;

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

function parseRawJsonObject(rawResponse: string): Record<string, unknown> {
  const jsonText = extractJsonSnippet(rawResponse);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('LLM response JSON was invalid');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('LLM response JSON must be an object');
  }

  return parsed as Record<string, unknown>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseDimension(value: unknown): ComprehensionDimension | null {
  return typeof value === 'string' && COMPREHENSION_DIMENSIONS.includes(value as ComprehensionDimension)
    ? value as ComprehensionDimension
    : null;
}

function parseFormat(value: unknown): ComprehensionFormat | null {
  return typeof value === 'string' && COMPREHENSION_FORMATS.includes(value as ComprehensionFormat)
    ? value as ComprehensionFormat
    : null;
}

function parseSection(value: unknown): ComprehensionExamSection | null {
  return typeof value === 'string' && COMPREHENSION_SECTIONS.includes(value as ComprehensionExamSection)
    ? value as ComprehensionExamSection
    : null;
}

function parseOptions(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const options = value.filter(isNonEmptyString).map((option) => option.trim());
  if (options.length !== 4) return null;
  const unique = new Set(options.map((option) => option.toLowerCase()));
  return unique.size === options.length ? options : null;
}

function parseGeneratedExamQuestion(
  value: unknown,
  index: number,
  allowedSourceIds: Set<string>
): GeneratedComprehensionQuestion {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Exam item ${index} is not an object`);
  }
  const obj = value as Record<string, unknown>;

  const dimension = parseDimension(obj.dimension);
  const format = parseFormat(obj.format);
  const section = parseSection(obj.section);
  const sourceArticleId = isNonEmptyString(obj.sourceArticleId) ? obj.sourceArticleId.trim() : null;
  const prompt = isNonEmptyString(obj.prompt) ? obj.prompt.trim() : null;
  const modelAnswer = isNonEmptyString(obj.modelAnswer) ? obj.modelAnswer.trim() : null;

  if (!dimension || !format || !section || !sourceArticleId || !prompt || !modelAnswer) {
    throw new Error(`Exam item ${index} is missing required fields`);
  }

  if (!allowedSourceIds.has(sourceArticleId)) {
    throw new Error(`Exam item ${index} references unknown source ${sourceArticleId}`);
  }

  const id = isNonEmptyString(obj.id) ? obj.id.trim() : `exam-${index + 1}`;
  const question: GeneratedComprehensionQuestion = {
    id,
    dimension,
    format,
    section,
    sourceArticleId,
    prompt,
    modelAnswer,
  };

  if (format === 'multiple-choice') {
    const options = parseOptions(obj.options);
    const correctOptionIndex = typeof obj.correctOptionIndex === 'number'
      ? Math.trunc(obj.correctOptionIndex)
      : Number.NaN;
    if (!options || !Number.isInteger(correctOptionIndex) || correctOptionIndex < 0 || correctOptionIndex >= options.length) {
      throw new Error(`Exam item ${index} has invalid multiple-choice payload`);
    }
    question.options = options;
    question.correctOptionIndex = correctOptionIndex;
  }

  if (format === 'true-false') {
    if (typeof obj.correctAnswer !== 'boolean') {
      throw new Error(`Exam item ${index} has invalid true-false payload`);
    }
    question.correctAnswer = obj.correctAnswer;
  }

  return question;
}

function assertItemInvariants(items: GeneratedComprehensionQuestion[], preset: ComprehensionExamPreset): void {
  const blueprint = getBlueprint(preset);
  const sectionCounts = {
    recall: 0,
    interpretation: 0,
    synthesis: 0,
  };

  if (items.length !== blueprint.questionCount) {
    throw new Error(`Exam item count mismatch: expected ${blueprint.questionCount}, got ${items.length}`);
  }

  const idSet = new Set<string>();
  let constructedCount = 0;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item.id || idSet.has(item.id)) {
      throw new Error(`Exam item ${i} has missing or duplicate id`);
    }
    idSet.add(item.id);

    const section = item.section;
    if (section === undefined) {
      throw new Error(`Exam item ${i} has no section`);
    }
    sectionCounts[section] += 1;

    if (item.section === 'recall' && item.format !== 'multiple-choice' && item.format !== 'true-false') {
      throw new Error(`Recall item ${i} must be objective-only`);
    }

    if (item.format === 'short-answer' || item.format === 'essay') {
      constructedCount += 1;
    }
  }

  for (const section of COMPREHENSION_SECTIONS) {
    if (sectionCounts[section] !== blueprint.sectionCounts[section]) {
      throw new Error(`Exam section ${section} mismatch: expected ${blueprint.sectionCounts[section]}, got ${sectionCounts[section]}`);
    }
  }

  if (constructedCount < blueprint.standardConstructedMin) {
    throw new Error(`Exam item has insufficient constructed-response questions (${constructedCount})`);
  }

  return;
}

function validateDifficultyTargets(
  items: GeneratedComprehensionQuestion[],
  preset: ComprehensionExamPreset,
  difficultyTarget: ExamDifficulty
): void {
  const blueprint = getBlueprint(preset);
  let constructedCount = 0;
  let essayCount = 0;

  for (const item of items) {
    if (item.format === 'short-answer' || item.format === 'essay') {
      constructedCount += 1;
    }
    if (item.format === 'essay') essayCount += 1;
  }

  const minimumConstructed = difficultyTarget === 'standard'
    ? blueprint.standardConstructedMin
    : blueprint.challengingConstructedMin;

  if (constructedCount < minimumConstructed) {
    throw new Error(`Exam difficulty target ${difficultyTarget} requires at least ${minimumConstructed} constructed-response questions`);
  }

  if (difficultyTarget === 'challenging' && essayCount < 1) {
    throw new Error('Challenging difficulty requires at least one essay question');
  }
}

function validateSourceCoverage(items: GeneratedComprehensionQuestion[], selectedSourceIds: string[]): void {
  if (selectedSourceIds.length >= 2) {
    const distinctSources = new Set(items.map((item) => item.sourceArticleId));
    if (distinctSources.size < 2) {
      throw new Error('Exam must reference at least two distinct source articles');
    }
  }
}

export function buildGenerateExamPrompt(args: GenerateExamPromptArgs): string {
  const blueprint = getBlueprint(args.preset);
  const sectionMix = Object.entries(blueprint.sectionCounts)
    .map(([section, count]) => `- ${section}: ${count}`)
    .join('\n');

  return [
    'You are generating a multi-source comprehension exam.',
    `Preset: ${args.preset}`,
    `Total questions: ${blueprint.questionCount}`,
    `Difficulty target: ${args.difficultyTarget}`,
    `Open-book for interpretation and synthesis: yes` + (args.openBookSynthesis ? '' : ' (enforced as closed for all sections)') ,
    `Section mix (exact):`,
    sectionMix,
    '',
    'Requirements:',
    '- Section must be one of: recall, interpretation, synthesis.',
    '- Every question must include sourceArticleId.',
    '- sourceArticleId must reference one of the provided sources.',
    '- Recall questions must be objective format only: multiple-choice or true-false.',
    '- Multiple-choice must include exactly 4 unique options and a valid correctOptionIndex.',
    '- True-false must include valid correctAnswer boolean.',
    '- Short-answer and essay must include modelAnswer.',
    '- Include both closed-book and open-book sections in order: recall, interpretation, synthesis.',
    '',
    `Return JSON only with this exact shape:`,
    '{',
    '  "items": [',
    '    {',
    '      "id": "item-1",',
    '      "dimension": "factual|inference|structural|evaluative",',
    '      "format": "multiple-choice|true-false|short-answer|essay",',
    '      "section": "recall|interpretation|synthesis",',
    `      "sourceArticleId": "one of the provided source ids",`,
    '      "prompt": "Question text",',
    '      "options": ["A", "B", "C", "D"],',
    '      "correctOptionIndex": 0,',
    '      "correctAnswer": true,',
    '      "modelAnswer": "Concise explanatory answer"',
    '    }',
    '  ]',
    '}',
    '',
    'Sources:',
    args.sourceContext,
  ].join('\n');
}

export function parseGeneratedExamResponse(args: ParseGeneratedExamArgs): GeneratedComprehensionCheck {
  const parsed = parseRawJsonObject(args.raw);
  if (!Array.isArray(parsed.items)) {
    throw new Error('Generated exam JSON missing items array');
  }

  const selectedSourceIds = new Set(args.selectedSourceArticleIds);
  const questions = parsed.items.map((item, index) =>
    parseGeneratedExamQuestion(item, index, selectedSourceIds)
  );

  assertItemInvariants(questions, args.preset);
  validateDifficultyTargets(questions, args.preset, args.difficultyTarget);
  validateSourceCoverage(questions, args.selectedSourceArticleIds);

  return { questions };
}
