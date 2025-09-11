import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import readline from 'readline';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 사용자 확인을 위한 인터페이스 생성
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

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

console.log(`\n⚠️  경고: 전역 배포를 진행하려고 합니다!`);
console.log('━'.repeat(50));
console.log('전역 배포는 모든 서버에 영향을 미치며, 반영까지 최대 1시간이 걸릴 수 있습니다.');
console.log(`배포할 명령어: ${commands.length}개`);
console.log('명령어 목록:');
commands.forEach((cmd, index) => {
    console.log(`  ${index + 1}. /${cmd.name} - ${cmd.description}`);
});
console.log('━'.repeat(50));

rl.question('\n정말로 전역 배포를 진행하시겠습니까? (yes/no): ', async (answer) => {
    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
        console.log('❌ 전역 배포가 취소되었습니다.');
        rl.close();
        process.exit(0);
    }

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    try {
        const appId = process.env.DISCORD_APP_ID;
        
        console.log(`\n🌍 전역 배포를 시작합니다... (${commands.length}개 명령어)`);
        
        const data = await rest.put(
            Routes.applicationCommands(appId),
            { body: commands }
        );
        
        console.log(`\n✅ ${data.length}개의 명령어를 전역으로 성공적으로 배포했습니다!`);
        console.log('배포 완료 시간:', new Date().toLocaleString('ko-KR'));
        console.log('\n📌 참고사항:');
        console.log('  • 전역 명령어는 모든 서버에서 사용 가능합니다');
        console.log('  • 반영까지 최대 1시간이 걸릴 수 있습니다');
        console.log('  • 일부 서버에서는 즉시 사용 가능할 수 있습니다');
        console.log('\n💡 팁: 개발 중에는 deploy-guild.js를 사용하여 즉시 반영되는 길드 배포를 사용하세요.');
    } catch (error) {
        console.error('❌ 전역 명령어 배포 중 오류 발생:', error);
        process.exit(1);
    } finally {
        rl.close();
    }
});