import { readFileSync } from 'fs';
import { join } from 'path';

const promptsDir = join(process.cwd(), 'prompts');

function loadPrompt(filename: string): string {
  return readFileSync(join(promptsDir, filename), 'utf-8');
}

export const DOMAIN_CONTEXT = loadPrompt('domain-context.md');

export const SocratesSystemPrompt = `${DOMAIN_CONTEXT}\n\n${loadPrompt('socrates.md')}`;

export const OracleSystemPrompt = `${DOMAIN_CONTEXT}\n\n${loadPrompt('oracle.md')}`;

export const CommentarySystemPrompt = loadPrompt('commentary.md');

export const SynthesisSystemPrompt = loadPrompt('synthesis.md');

export const OffTopicSystemPrompt = loadPrompt('off-topic.md');
