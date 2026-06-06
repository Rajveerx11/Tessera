import { z } from 'zod';

export const TestCasePrioritySchema = z.union([
  z.literal('p0'),
  z.literal('p1'),
  z.literal('p2'),
  z.literal('p3'),
]);

export type TestCasePriority = z.infer<typeof TestCasePrioritySchema>;

/**
 * Test-design category of one case (`test_cases_v2`). The prompt mandates
 * at least one `negative` and one `boundary` case per covered feature.
 */
export const TestCaseTypeSchema = z.union([
  z.literal('positive'),
  z.literal('negative'),
  z.literal('boundary'),
  z.literal('error'),
  z.literal('security'),
]);

export type TestCaseType = z.infer<typeof TestCaseTypeSchema>;

/**
 * One separated step (TestRail pattern): imperative action plus the
 * observable expected result of that step. Mirrors the `steps.items`
 * object in the Rust `emit_test_cases` v2 tool schema.
 */
export const TestCaseStepSchema = z.object({
  action: z.string().min(1),
  expectedResult: z.string().min(1),
});

export type TestCaseStep = z.infer<typeof TestCaseStepSchema>;

/**
 * One file in the runnable workspace carried on a test-cases artifact —
 * mirrors the Rust `WorkspaceFile` the sandbox runner consumes
 * (`structured_data.files[]`). `isTest` is true for a generated vitest
 * spec, false for source-under-test.
 */
export const TestCaseFileSchema = z.object({
  path: z.string().min(1),
  contents: z.string(),
  isTest: z.boolean(),
});

export type TestCaseFile = z.infer<typeof TestCaseFileSchema>;

/**
 * Structured payload for test cases artifact (`structured_data` JSON).
 *
 * Mirrors the Rust `emit_test_cases` tool schema in
 * `prompts/test_cases_v2.rs`: separated steps, case `type`, optional
 * `testData` / `postconditions`. `files` is the optional runnable
 * workspace (source-under-test + vitest specs) the sandbox test runner
 * executes; descriptive-only artifacts omit it — that contract is
 * unchanged from v1.
 */
export const TestCaseSchema = z.object({
  cases: z.array(
    z.object({
      id: z.string().regex(/^TC-[A-Z0-9_-]+$/),
      title: z.string().min(5).max(200),
      type: TestCaseTypeSchema,
      priority: TestCasePrioritySchema,
      preconditions: z.array(z.string().min(1)).optional(),
      testData: z.string().optional(),
      steps: z.array(TestCaseStepSchema).min(1),
      postconditions: z.array(z.string().min(1)).optional(),
      traceability: z.array(z.string().min(1)).optional(),
    }),
  ),
  files: z.array(TestCaseFileSchema).optional(),
});

export type TestCase = z.infer<typeof TestCaseSchema>;
