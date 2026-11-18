import { z } from "zod";
export const taskSchema = z
  .object({
    code: z.string().trim().min(1).max(40),
    description: z.string().trim().min(3).max(1000),
    estimatedMinutes: z.number().int().min(1).max(100000).nullable().optional(),
  })
  .strict();
export const tasksSchema = z
  .array(taskSchema)
  .max(200)
  .superRefine((tasks, ctx) => {
    const seen = new Set<string>();
    tasks.forEach((t, i) => {
      const key = t.code.toUpperCase();
      if (seen.has(key))
        ctx.addIssue({
          code: "custom",
          path: [i, "code"],
          message: "Código de tarefa repetido no plano",
        });
      seen.add(key);
    });
  });
