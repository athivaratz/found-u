import { z } from "zod";

export const wizardAdminSchema = z
  .object({
    studentId: z
      .string()
      .trim()
      .regex(/^\d{5}$/, "เลขแอดมินต้องเป็นตัวเลข 5 หลัก"),
    password: z.string().min(7, "รหัสผ่านต้องมีอย่างน้อย 7 ตัว"),
    confirmPassword: z.string(),
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    nickname: z.string().trim().max(50).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "รหัสผ่านไม่ตรงกัน",
    path: ["confirmPassword"],
  });

export type WizardAdminInput = z.infer<typeof wizardAdminSchema>;
