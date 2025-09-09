import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commands = [];
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const command = await import(pathToFileURL(filePath).href);
    if ('data' in command.default && 'execute' in command.default) {
        commands.push(command.default.data.toJSON());
    }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        const appId = process.env.DISCORD_APP_ID;
        const devGuildId = process.env.DEV_GUILD_ID;

        console.log(`${commands.length}개의 애플리케이션(/) 명령어 새로고침을 시작합니다.`);

        const route = devGuildId
            ? Routes.applicationGuildCommands(appId, devGuildId)
            : Routes.applicationCommands(appId);

        const data = await rest.put(route, { body: commands });

        if (devGuildId) {
            console.log(`길드 ${devGuildId}의 ${data.length}개 길드 명령어를 성공적으로 다시 로드했습니다.`);
        } else {
            console.log(`${data.length}개의 전역 명령어를 성공적으로 다시 로드했습니다.`);
        }
    } catch (error) {
        console.error(error);
    }
})();
