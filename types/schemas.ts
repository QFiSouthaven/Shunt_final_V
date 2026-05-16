// types/schemas.ts
import { z } from 'zod';

// --- Shared Schemas ---
export const tokenUsageSchema = z.object({
  prompt_tokens: z.coerce.number().default(0),
  completion_tokens: z.coerce.number().default(0),
  total_tokens: z.coerce.number().default(0),
  model: z.string().default('unknown-model'),
});

// --- AI plan response schema (used by generateDevelopmentPlan and generateCodeFixPlan) ---
export const implementationTaskSchema = z.object({
  filePath: z.string().min(1, 'File path is required'),
  description: z.string().default('No description provided'),
  details: z.string().optional(),
  newContent: z.string().optional(),
});

export const aiPlanResponseSchema = z.object({
  clarifyingQuestions: z.array(z.string()).default([]),
  architecturalProposal: z.string().default(''),
  implementationTasks: z.array(implementationTaskSchema).default([]),
  testCases: z.array(z.string()).default([]),
  internalMonologue: z.string().optional(),
  dataSchema: z.string().optional(),
});
