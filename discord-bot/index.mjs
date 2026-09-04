import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(filename) {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;

    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

// Next.js loads .env.local for the web app, but this standalone Node process
// does not. Read it here while preserving values supplied by the host.
loadEnvFile(".env.local");

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const DISCORD_BOT_TOKEN = required("DISCORD_BOT_TOKEN");
const DISCORD_APPLICATION_ID = required("DISCORD_APPLICATION_ID");
const DISCORD_GUILD_ID = required("DISCORD_GUILD_ID");
const DISCORD_BOT_API_SECRET = required("DISCORD_BOT_API_SECRET");
const FOUNDU_BASE_URL = required("FOUNDU_BASE_URL").replace(/\/$/, "");
const pollInterval = Number(process.env.DISCORD_SYNC_INTERVAL_MS || "8000");
const POLL_INTERVAL_MS =
  Number.isInteger(pollInterval) && pollInterval >= 5_000 && pollInterval <= 60_000
    ? pollInterval
    : 8_000;

const commands = [
  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("ยืนยันบัญชี Found-U เพื่อรับ Role"),
  new SlashCommandBuilder()
    .setName("sync")
    .setDescription("อัปเดต Role จากบัญชี Found-U อีกครั้ง"),
].map((command) => command.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let polling = false;
let pollTimer;

function apiUrl(path) {
  return new URL(path, `${FOUNDU_BASE_URL}/`).toString();
}

async function callFoundU(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      authorization: `Bearer ${DISCORD_BOT_API_SECRET}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Found-U API returned ${response.status}`);
  }
  return payload;
}

async function createVerificationSession(discordUserId) {
  return callFoundU("/api/discord/bot/verification-sessions", {
    method: "POST",
    body: JSON.stringify({ guildId: DISCORD_GUILD_ID, discordUserId }),
  });
}

async function getMemberAuthorization(discordUserId) {
  return callFoundU(
    `/api/discord/bot/members/${encodeURIComponent(discordUserId)}?guildId=${encodeURIComponent(DISCORD_GUILD_ID)}`
  );
}

async function recordSessionResult(sessionId, fulfilled, failureReason) {
  return callFoundU(
    `/api/discord/bot/verification-sessions/${encodeURIComponent(sessionId)}/result`,
    {
      method: "POST",
      body: JSON.stringify({
        guildId: DISCORD_GUILD_ID,
        fulfilled,
        ...(failureReason ? { failureReason: failureReason.slice(0, 300) } : {}),
      }),
    }
  );
}

async function fetchMember(discordUserId) {
  const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
  return guild.members.fetch(discordUserId);
}

async function resolveEditableRole(guild, roleId) {
  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role) throw new Error(`ไม่พบ Role ${roleId} ในเซิร์ฟเวอร์`);
  if (role.managed) throw new Error(`Role ${role.name} ถูกจัดการโดย integration อื่น`);
  if (!role.editable) {
    throw new Error(`บอทไม่มีสิทธิ์จัดการ Role ${role.name} (ตรวจสอบ Manage Roles และลำดับ Role)`);
  }
  return role;
}

async function synchronizeMemberRoles({ discordUserId, expectedRoleIds, managedRoleIds }) {
  const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
  const member = await fetchMember(discordUserId);
  const expected = new Set(expectedRoleIds);
  const managed = new Set(managedRoleIds);
  const toAdd = [...expected].filter((roleId) => !member.roles.cache.has(roleId));
  const toRemove = [...managed].filter(
    (roleId) => !expected.has(roleId) && member.roles.cache.has(roleId)
  );

  for (const roleId of [...toAdd, ...toRemove]) {
    await resolveEditableRole(guild, roleId);
  }

  for (const roleId of toAdd) {
    await member.roles.add(roleId, "Found-U verification sync");
  }
  for (const roleId of toRemove) {
    await member.roles.remove(roleId, "Found-U verification sync");
  }

  return { added: toAdd.length, removed: toRemove.length };
}

function conciseError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 300);
}

async function synchronizeVerifiedSession(session) {
  try {
    const authorization = await getMemberAuthorization(session.discordUserId);
    await synchronizeMemberRoles({
      discordUserId: session.discordUserId,
      expectedRoleIds: authorization.expectedRoleIds || [],
      managedRoleIds: authorization.managedRoleIds || [],
    });
    await recordSessionResult(session.id, true);
    console.info(`Discord verification fulfilled for ${session.discordUserId}`);
  } catch (error) {
    const reason = conciseError(error);
    console.error(`Discord verification sync failed for ${session.discordUserId}: ${reason}`);
    try {
      await recordSessionResult(session.id, false, reason);
    } catch (recordError) {
      console.error(`Could not record Discord sync failure: ${conciseError(recordError)}`);
    }
  }
}

async function pollVerifiedSessions() {
  if (polling) return;
  polling = true;
  try {
    const { sessions = [] } = await callFoundU("/api/discord/bot/verification-sessions?limit=50");
    for (const session of sessions) {
      await synchronizeVerifiedSession(session);
    }
  } catch (error) {
    console.error(`Could not read Found-U verification queue: ${conciseError(error)}`);
  } finally {
    polling = false;
  }
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(DISCORD_APPLICATION_ID, DISCORD_GUILD_ID), {
    body: commands,
  });
}

client.once(Events.ClientReady, async (readyClient) => {
  try {
    await registerCommands();
    console.info(`Found-U Discord bot logged in as ${readyClient.user.tag}`);
    await pollVerifiedSessions();
    pollTimer = setInterval(() => void pollVerifiedSessions(), POLL_INTERVAL_MS);
  } catch (error) {
    console.error(`Bot startup failed: ${conciseError(error)}`);
    process.exitCode = 1;
    readyClient.destroy();
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.guildId !== DISCORD_GUILD_ID) {
    await interaction.reply({
      content: "บอทนี้ตั้งค่าไว้สำหรับอีกเซิร์ฟเวอร์หนึ่ง",
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "verify") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const { verificationUrl } = await createVerificationSession(interaction.user.id);
      await interaction.editReply(
        `กดลิงก์นี้เพื่อเข้าสู่ระบบ Found-U และยืนยันตัวตน (ใช้ได้ 15 นาที และใช้ได้ครั้งเดียว):\n${verificationUrl}`
      );
    } catch (error) {
      console.error(`Could not create verification link: ${conciseError(error)}`);
      await interaction.editReply("สร้างลิงก์ยืนยันไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
    return;
  }

  if (interaction.commandName === "sync") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const authorization = await getMemberAuthorization(interaction.user.id);
      const result = await synchronizeMemberRoles({
        discordUserId: interaction.user.id,
        expectedRoleIds: authorization.expectedRoleIds || [],
        managedRoleIds: authorization.managedRoleIds || [],
      });

      if (!authorization.verified) {
        await interaction.editReply(
          result.removed > 0
            ? "ยังไม่พบการยืนยัน Found-U จึงนำ Role ที่บอทจัดการออกแล้ว ใช้ /verify เพื่อยืนยันตัวตน"
            : "ยังไม่พบการยืนยัน Found-U ใช้ /verify เพื่อยืนยันตัวตน"
        );
      } else if (result.added === 0 && result.removed === 0) {
        await interaction.editReply("Role ของคุณเป็นปัจจุบันแล้ว");
      } else {
        await interaction.editReply(`อัปเดต Role สำเร็จ: เพิ่ม ${result.added} และนำออก ${result.removed}`);
      }
    } catch (error) {
      console.error(`Manual Discord role sync failed: ${conciseError(error)}`);
      await interaction.editReply(
        "อัปเดต Role ไม่สำเร็จ โปรดให้ผู้ดูแลตรวจสอบสิทธิ์ Manage Roles และลำดับ Role ของบอท"
      );
    }
  }
});

function shutdown(signal) {
  console.info(`Received ${signal}; stopping Found-U Discord bot.`);
  if (pollTimer) clearInterval(pollTimer);
  client.destroy();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

client.login(DISCORD_BOT_TOKEN).catch((error) => {
  console.error(`Discord login failed: ${conciseError(error)}`);
  process.exitCode = 1;
});
