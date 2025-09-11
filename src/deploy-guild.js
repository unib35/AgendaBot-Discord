import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 길드 ID 확인
const DEV_GUILD_ID = process.env.DEV_GUILD_ID;
if (!DEV_GUILD_ID) {
    console.error('❌ DEV_GUILD_ID가 .env 파일에 설정되지 않았습니다.');
    process.exit(1);
}

const commands = [];
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log('📂 명령어 파일 로드 중...');
for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const command = await import(pathToFileURL(filePath).href);
    if ('data' in command.default && 'execute' in command.default) {
        commands.push(command.default.data.toJSON());
        console.log(`  ✅ ${file} 로드됨`);
    } else {
        console.log(`  ⚠️ ${file} - 유효한 명령어 구조가 아님`);
    }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        const appId = process.env.DISCORD_APP_ID;
        
        console.log(`\n🚀 개발 서버(${DEV_GUILD_ID})에 ${commands.length}개의 명령어 배포를 시작합니다.`);
        console.log('명령어 목록:');
        commands.forEach((cmd, index) => {
            console.log(`  ${index + 1}. /${cmd.name} - ${cmd.description}`);
        });
        
        const data = await rest.put(
            Routes.applicationGuildCommands(appId, DEV_GUILD_ID),
            { body: commands }
        );
        
        console.log(`\n✅ 개발 서버에 ${data.length}개의 명령어를 성공적으로 배포했습니다!`);
        console.log('배포 완료 시간:', new Date().toLocaleString('ko-KR'));
        console.log('\n💡 팁: 개발 서버에서 즉시 명령어를 사용할 수 있습니다.');
    } catch (error) {
        console.error('❌ 명령어 배포 중 오류 발생:', error);
        process.exit(1);
    }
})();