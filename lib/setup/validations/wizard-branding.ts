import { z } from "zod";

export const wizardBrandingSchema = z.object({
  schoolName: z
    .string()
    .trim()
    .min(2, "ชื่อโรงเรียนต้องมีอย่างน้อย 2 ตัวอักษร")
    .max(200, "ชื่อโรงเรียนยาวเกินไป"),
});

export type WizardBrandingInput = z.infer<typeof wizardBrandingSchema>;
