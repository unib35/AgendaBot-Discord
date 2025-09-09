import { REST, Routes } from 'discord.js';
import 'dotenv/config';

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
const appId = process.env.DISCORD_APP_ID;
const guildId = process.env.DEV_GUILD_ID;

async function main() {
  if (guildId) {
    console.log('Clearing GUILD commands…');
    await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: [] });
    console.log('✅ Cleared guild commands');
  }

  console.log('Clearing GLOBAL commands…');
  await rest.put(Routes.applicationCommands(appId), { body: [] });
  console.log('✅ Cleared global commands');

  console.log('완료! 전역(Global)은 반영까지 수 분 정도 걸릴 수 있습니다.');
}
main().catch(console.error);