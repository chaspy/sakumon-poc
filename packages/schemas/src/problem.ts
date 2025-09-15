import { z } from "zod";

export const problemSchema = z.object({
  type: z.enum(["mcq", "free"]),
  prompt: z.string(),
  choices: z.array(z.string()).optional(),
  answer: z.string(),
  explanation: z.string().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  objectives: z.array(z.string()).optional(),
  rubric: z
    .object({
      maxPoints: z.number().int().optional(),
      criteria: z.array(
        z.object({
          name: z.string(),
          desc: z.string().optional(),
          points: z.number().int(),
        })
      ).optional(),
    })
    .optional(),
  meta: z.record(z.any()).optional(),
});

export type Problem = z.infer<typeof problemSchema>;

export const problemArraySchema = z.array(problemSchema);

// JSON Schema (strict) — 単一オブジェクト（oneOf非使用）
const rubricSchema = {
  type: "object",
  properties: {
    maxPoints: { type: "integer" },
    criteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          desc: { type: "string" },
          points: { type: "integer" },
        },
        required: ["name", "desc", "points"],
        additionalProperties: false,
      },
    },
  },
  required: ["maxPoints", "criteria"],
  additionalProperties: false,
} as const;

export const jsonSchemaForProblem = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Problem",
  type: "object",
  properties: {
    type: { enum: ["mcq", "free"] },
    prompt: { type: "string" },
    choices: { type: "array", items: { type: "string" } },
    answer: { type: "string" },
    explanation: { type: "string" },
    difficulty: { type: "integer", minimum: 1, maximum: 5 },
    objectives: { type: "array", items: { type: "string" } },
    rubric: rubricSchema,
    meta: { type: "object", properties: {}, additionalProperties: false },
  },
  required: ["type", "prompt", "choices", "answer", "explanation", "difficulty", "objectives", "rubric", "meta"],
  additionalProperties: false,
} as const;

export const jsonSchemaForProblemArray = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "ProblemArray",
  type: "array",
  items: jsonSchemaForProblem,
} as const;

export const problemEnvelopeSchema = z.object({ items: problemArraySchema });
export type ProblemEnvelope = z.infer<typeof problemEnvelopeSchema>;

export const jsonSchemaForProblemEnvelope = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "ProblemEnvelope",
  type: "object",
  properties: {
    items: jsonSchemaForProblemArray,
  },
  required: ["items"],
  additionalProperties: false,
} as const;
