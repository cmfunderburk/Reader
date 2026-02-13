import type {
  ComprehensionQuestionScore,
  ComprehensionGeminiModel,
  GeneratedComprehensionCheck,
  GeneratedComprehensionQuestion,
  ComprehensionExamPreset,
  Article,
} from '../types';
import {
  buildGenerateCheckPrompt,
  buildScoreAnswerPrompt,
  parseGeneratedCheckResponse,
  parseQuestionScoreResponse,
} from './comprehensionPrompts';
import {
  buildGenerateExamPrompt,
  parseGeneratedExamResponse,
} from './comprehensionExamPrompts';
import {
  buildComprehensionExamContext,
  getComprehensionExamSourceIds,
} from './comprehensionExamContext';
import type { GenerateExamPromptArgs, ParseGeneratedExamArgs } from './comprehensionExamPrompts';

export interface ComprehensionExamRequest {
  selectedArticles: Article[];
  preset: ComprehensionExamPreset;
  difficultyTarget: 'standard' | 'challenging';
  openBookSynthesis: boolean;
}

export interface ComprehensionAdapter {
  generateCheck(passage: string, questionCount: number): Promise<GeneratedComprehensionCheck>;
  generateExam(request: ComprehensionExamRequest): Promise<GeneratedComprehensionCheck>;
  scoreAnswer(
    passage: string,
    question: GeneratedComprehensionQuestion,
    userAnswer: string
  ): Promise<ComprehensionQuestionScore>;
}

interface GeminiCandidatePart {
  text?: string;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiCandidatePart[];
  };
}

interface GeminiResponsePayload {
  candidates?: GeminiCandidate[];
  promptFeedback?: {
    blockReason?: string;
  };
}

interface GeminiAdapterOptions {
  apiKey?: string;
  model?: ComprehensionGeminiModel;
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string;
}

const DEFAULT_GEMINI_MODEL: ComprehensionGeminiModel = 'gemini-3-flash-preview';
const DEFAULT_GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractGeminiText(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new Error('Gemini response payload was not an object');
  }

  const typed = payload as GeminiResponsePayload;
  if (typed.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the request (${typed.promptFeedback.blockReason})`);
  }

  const candidates = typed.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('Gemini response did not include candidates');
  }

  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error('Gemini response did not include content parts');
  }

  const text = parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();
  if (!text) {
    throw new Error('Gemini response did not include text content');
  }

  return text;
}

export class GeminiComprehensionAdapter implements ComprehensionAdapter {
  private readonly apiKey: string | undefined;
  private readonly model: ComprehensionGeminiModel;
  private readonly fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  private readonly apiBaseUrl: string;

  constructor(options: GeminiAdapterOptions) {
    this.apiKey = options.apiKey?.trim();
    this.model = options.model ?? DEFAULT_GEMINI_MODEL;
    const selectedFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    // Wrap to avoid calling a Window-bound fetch with adapter instance as `this`.
    this.fetchImpl = (input, init) => selectedFetch(input, init);
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_GEMINI_API_BASE_URL;
  }

  async generateCheck(passage: string, questionCount: number): Promise<GeneratedComprehensionCheck> {
    const prompt = buildGenerateCheckPrompt(passage, questionCount);
    const rawText = await this.generateContent(prompt);
    return parseGeneratedCheckResponse(rawText);
  }

  async generateExam(request: ComprehensionExamRequest): Promise<GeneratedComprehensionCheck> {
    const context = buildComprehensionExamContext(request.selectedArticles, request.preset);
    const sourceArticleIds = getComprehensionExamSourceIds(context);
    const generatorInput: GenerateExamPromptArgs = {
      sourceContext: renderSourceContext(context),
      preset: request.preset,
      difficultyTarget: request.difficultyTarget,
      openBookSynthesis: request.openBookSynthesis,
    };

    let lastError: unknown = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const prompt = buildGenerateExamPrompt(generatorInput);
        const rawText = await this.generateContent(prompt);
        const parseArgs: ParseGeneratedExamArgs = {
          raw: rawText,
          preset: request.preset,
          difficultyTarget: request.difficultyTarget,
          selectedSourceArticleIds: sourceArticleIds,
        };
        return parseGeneratedExamResponse(parseArgs);
      } catch (error) {
        lastError = error;
        if (attempt === 0) {
          continue;
        }
        throw lastError;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to generate a valid exam');
  }

  async scoreAnswer(
    passage: string,
    question: GeneratedComprehensionQuestion,
    userAnswer: string
  ): Promise<ComprehensionQuestionScore> {
    const prompt = buildScoreAnswerPrompt(passage, question, userAnswer);
    const rawText = await this.generateContent(prompt);
    return parseQuestionScoreResponse(rawText);
  }

  private async generateContent(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Comprehension check requires an API key');
    }

    const response = await this.fetchImpl(
      `${this.apiBaseUrl}/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        }),
      }
    );

    if (!response.ok) {
      const message = (await response.text()).trim();
      throw new Error(
        `Gemini request failed (${response.status}): ${message || response.statusText || 'unknown error'}`
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('Gemini response was not valid JSON');
    }

    return extractGeminiText(payload);
  }

}

interface CreateComprehensionAdapterOptions extends GeminiAdapterOptions {
  provider?: 'gemini';
}

export function createComprehensionAdapter(
  options: CreateComprehensionAdapterOptions
): ComprehensionAdapter {
  return new GeminiComprehensionAdapter(options);
}

function renderSourceContext(context: ReturnType<typeof buildComprehensionExamContext>): string {
  return context.packets
    .map((packet, index) => {
      const header = `${index + 1}. ${packet.title}`;
      const sourceMeta = packet.group ? ` (${packet.group})` : '';
      return `${header}${sourceMeta}\n[sourceId=${packet.articleId}]\n${packet.excerpt}`;
    })
    .join('\n\n');
}
