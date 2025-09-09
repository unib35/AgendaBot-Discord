import { REST, Routes } from 'discord.js';
import 'dotenv/config';

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
const appId = process.env.DISCORD_APP_ID;
const guildId = process.env.DEV_GUILD_ID;

const global = await rest.get(Routes.applicationCommands(appId));
console.log('GLOBAL:', global.map(c => c.name));

if (guildId) {
  const guild = await rest.get(Routes.applicationGuildCommands(appId, guildId));
  console.log('GUILD :', guild.map(c => c.name));
}