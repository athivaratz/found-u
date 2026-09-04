import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const discordIdSchema = z.string().trim().regex(/^\d{17,20}$/, "Discord ID ไม่ถูกต้อง");

const roleRuleSchema = z.object({
  roleId: discordIdSchema,
  when: z
    .object({
      role: z.enum(["user", "admin"]).optional(),
      gradeLevel: z.string().trim().min(1).max(40).optional(),
      roomNumber: z.string().trim().min(1).max(10).optional(),
    })
    .refine((value) => Object.values(value).some((item) => item !== undefined), {
      message: "แต่ละกฎต้องระบุเงื่อนไขอย่างน้อย 1 ข้อ",
    }),
});

const roleRulesSchema = z.array(roleRuleSchema).max(100);

export type DiscordAccount = {
  role: "user" | "admin";
  grade_level: string | null;
  room_number: string | null;
};

export type DiscordRoleRule = z.infer<typeof roleRuleSchema>;

export type DiscordRoleConfig = {
  verifiedRoleId: string | null;
  adminRoleId: string | null;
  rules: DiscordRoleRule[];
};

export class DiscordConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscordConfigurationError";
  }
}

function optionalDiscordId(name: string): string | null {
  const value = process.env[name]?.trim();
  if (!value) return null;

  const parsed = discordIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new DiscordConfigurationError(`${name} ต้องเป็น Discord Snowflake ID`);
  }
  return parsed.data;
}

export function getDiscordGuildId(): string {
  const guildId = optionalDiscordId("DISCORD_GUILD_ID");
  if (!guildId) {
    throw new DiscordConfigurationError("ยังไม่ได้ตั้งค่า DISCORD_GUILD_ID");
  }
  return guildId;
}

export function getDiscordRoleConfig(): DiscordRoleConfig {
  const verifiedRoleId = optionalDiscordId("DISCORD_VERIFIED_ROLE_ID");
  const adminRoleId = optionalDiscordId("DISCORD_ADMIN_ROLE_ID");
  const rawRules = process.env.DISCORD_ROLE_RULES_JSON?.trim();

  let rules: DiscordRoleRule[] = [];
  if (rawRules) {
    try {
      rules = roleRulesSchema.parse(JSON.parse(rawRules));
    } catch {
      throw new DiscordConfigurationError(
        "DISCORD_ROLE_RULES_JSON ต้องเป็น JSON ของกฎ Role ที่ถูกต้อง"
      );
    }
  }

  if (!verifiedRoleId && !adminRoleId && rules.length === 0) {
    throw new DiscordConfigurationError(
      "ต้องตั้งค่า DISCORD_VERIFIED_ROLE_ID, DISCORD_ADMIN_ROLE_ID หรือ DISCORD_ROLE_RULES_JSON อย่างน้อยหนึ่งค่า"
    );
  }

  return { verifiedRoleId, adminRoleId, rules };
}

export function resolveDiscordRoleIds(account: DiscordAccount): string[] {
  const config = getDiscordRoleConfig();
  const roleIds = new Set<string>();

  if (config.verifiedRoleId) roleIds.add(config.verifiedRoleId);
  if (account.role === "admin" && config.adminRoleId) roleIds.add(config.adminRoleId);

  for (const rule of config.rules) {
    const matchesRole = !rule.when.role || rule.when.role === account.role;
    const matchesGrade =
      !rule.when.gradeLevel || rule.when.gradeLevel === account.grade_level?.trim();
    const matchesRoom =
      !rule.when.roomNumber || rule.when.roomNumber === account.room_number?.trim();
    if (matchesRole && matchesGrade && matchesRoom) roleIds.add(rule.roleId);
  }

  return [...roleIds];
}

export function getManagedDiscordRoleIds(): string[] {
  const config = getDiscordRoleConfig();
  return [
    ...new Set(
      [config.verifiedRoleId, config.adminRoleId, ...config.rules.map((rule) => rule.roleId)].filter(
        (roleId): roleId is string => Boolean(roleId)
      )
    ),
  ];
}

export function isDiscordId(value: string): boolean {
  return discordIdSchema.safeParse(value).success;
}

function getVerificationTokenSecret(): string {
  const secret =
    process.env.DISCORD_VERIFICATION_TOKEN_SECRET?.trim() ||
    process.env.DISCORD_BOT_API_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new DiscordConfigurationError(
      "ต้องตั้งค่า DISCORD_VERIFICATION_TOKEN_SECRET หรือ DISCORD_BOT_API_SECRET ที่สุ่มยาวอย่างน้อย 32 ตัวอักษร"
    );
  }
  return secret;
}

export function createDiscordVerificationToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashDiscordVerificationToken(token: string): string {
  return createHash("sha256")
    .update(`${getVerificationTokenSecret()}:${token}`)
    .digest("hex");
}

export function isValidDiscordVerificationToken(token: string): boolean {
  return /^[a-f\d]{64}$/i.test(token);
}

export function buildDiscordVerificationUrl(token: string, origin?: string): string {
  const url = new URL("/discord/verify", origin || "https://foundu.forum");
  url.searchParams.set("token", token);
  return url.toString();
}

export function isDiscordBotAuthorized(request: Request): boolean {
  const expected = process.env.DISCORD_BOT_API_SECRET?.trim();
  const header = request.headers.get("authorization");
  const provided = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export function readDiscordRoleIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && isDiscordId(item)))];
}
