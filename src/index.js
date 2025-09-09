import { Client, GatewayIntentBits, Collection, MessageFlags, EmbedBuilder, ChannelType } from 'discord.js';
import { config } from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import cron from 'node-cron';
import { initDatabase, getTopicsBetween, getGuildSettings, upsertGuildSettings, getAllGuildSettings } from './db/database.js';
import { handleAddAgendaModal } from './handlers/modalHandler.js';
import { handleButtonInteraction, handleSelectMenuInteraction, handleAddCheckModal } from './handlers/buttonHandler.js';
import { handleUserSelect, handleAddNext, clearPendingAssignees } from './handlers/addAgendaHandler.js';
import { summarizeWeeklyGemini } from './ai/summarize-gemini.js';
import { encrypt, decrypt } from './utils/secret.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
    ],
});

client.commands = new Collection();

const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const command = await import(pathToFileURL(filePath).href);
    if ('data' in command.default && 'execute' in command.default) {
        client.commands.set(command.default.data.name, command.default);
    } else {
        console.log(`[경고] ${filePath}의 명령어에 필요한 "data" 또는 "execute" 속성이 누락되었습니다.`);
    }
}

// 주간 요약을 위한 헬퍼 함수
function getWeekStart(date, startDay = 'MON') {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = startDay === 'SUN' ? -day : (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    return d;
}

function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

client.once('clientReady', () => {
    console.log(`✅ ${client.user.tag}로 로그인했습니다!`);
    initDatabase();
    
    // 서버별 자동 요약 스케줄 설정
    const timezone = process.env.TIMEZONE || 'Asia/Seoul';
    const scheduledJobs = new Map();
    
    // 서버별 스케줄 업데이트 함수
    const updateSchedules = () => {
        // 기존 스케줄 모두 정지
        for (const [guildId, job] of scheduledJobs) {
            job.stop();
        }
        scheduledJobs.clear();
        
        // 활성화된 서버들의 스케줄 설정
        const guildSettings = getAllGuildSettings();
        
        for (const settings of guildSettings) {
            if (!settings.weekly_summary_enabled || !settings.ai_api_key_encrypted) {
                continue;
            }
            
            const cronExpression = settings.weekly_summary_cron || '0 9 * * MON';
            
            console.log(`📅 길드 ${settings.guild_id}의 요약 스케줄 설정: ${cronExpression}`);
            
            const job = cron.schedule(cronExpression, async () => {
                try {
                    const guild = client.guilds.cache.get(settings.guild_id);
                    if (!guild) return;
                    
                    console.log(`🤖 ${guild.name} 서버의 주간 요약을 생성 중...`);
                    
                    // API 키 복호화
                    const apiKey = decrypt(settings.ai_api_key_encrypted);
                    if (!apiKey) {
                        console.error(`길드 ${settings.guild_id}의 API 키 복호화 실패`);
                        return;
                    }
                    
                    // 지난 주 범위 계산
                    const weekStart = settings.week_start || 'MON';
                    const now = new Date();
                    const weekEnd = getWeekStart(now, weekStart);
                    const weekStartDate = new Date(weekEnd);
                    weekStartDate.setDate(weekStartDate.getDate() - 7);
                    
                    // 안건 조회
                    const startTimestamp = Math.floor(weekStartDate.getTime() / 1000);
                    const endTimestamp = Math.floor(weekEnd.getTime() / 1000);
                    const topics = getTopicsBetween(settings.guild_id, startTimestamp, endTimestamp);
                    
                    if (!topics || topics.length === 0) {
                        console.log(`${guild.name} 서버에 안건이 없습니다`);
                        return;
                    }
                    
                    // Gemini AI 초기화
                    const genAI = new GoogleGenerativeAI(apiKey);
                    const model = genAI.getGenerativeModel({ 
                        model: settings.gemini_model || 'gemini-2.0-flash-exp' 
                    });
                    
                    // 프롬프트 생성
                    const topicsText = topics.map(topic => 
                        `- [${topic.status}] ${topic.title} (ID: ${topic.id})`
                    ).join('\n');
                    
                    const prompt = `다음은 지난 주의 안건 목록입니다. 핵심 내용을 요약해주세요.

기간: ${formatDate(weekStartDate)} ~ ${formatDate(new Date(weekEnd.getTime() - 1))}
총 안건 수: ${topics.length}개

안건 목록:
${topicsText}

요약 형식:
1. 주요 활동: 가장 중요한 안건 3-5개 요약
2. 진행 상황: 완료된 안건과 진행 중인 안건 정리
3. 다음 단계: 향후 집중해야 할 사항

간결하고 실용적인 요약을 제공해주세요.`;
                    
                    // AI 요약 생성
                    const result = await model.generateContent(prompt);
                    const aiSummary = result.response?.text();
                    
                    // Embed 생성
                    const periodTitle = `주간 안건 요약 (${formatDate(weekStartDate)} ~ ${formatDate(new Date(weekEnd.getTime() - 1))})`;
                    const embed = new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('📊 주간 안건 요약')
                        .setDescription(periodTitle)
                        .addFields({
                            name: '통계',
                            value: `총 ${topics.length}개 안건 분석`,
                            inline: false
                        });
                    
                    if (aiSummary) {
                        const chunks = aiSummary.match(/.{1,1024}/gs) || [aiSummary];
                        chunks.forEach((chunk, index) => {
                            embed.addFields({
                                name: index === 0 ? '📝 AI 요약' : '​',
                                value: chunk,
                                inline: false
                            });
                        });
                    }
                    
                    embed.setFooter({ 
                        text: `자동 생성 | ${settings.gemini_model || 'gemini-2.0-flash-exp'}` 
                    });
                    embed.setTimestamp();
                    
                    // 요약 채널에 게시
                    const channelId = settings.summary_channel_id || settings.tracking_channel_id;
                    const channel = await guild.channels.fetch(channelId).catch(() => null);
                    
                    if (channel?.type === ChannelType.GuildText) {
                        await channel.send({ 
                            embeds: [embed],
                            allowedMentions: { parse: [] }
                        });
                        console.log(`✅ ${guild.name} 서버에 주간 요약이 게시되었습니다`);
                    }
                    
                } catch (error) {
                    console.error(`길드 ${settings.guild_id}의 요약 생성 실패:`, error);
                }
            }, { timezone, scheduled: false });
            
            job.start();
            scheduledJobs.set(settings.guild_id, job);
        }
        
        console.log(`📅 활성화된 요약 스케줄: ${scheduledJobs.size}개`);
    };
    
    // 초기 스케줄 설정
    updateSchedules();
    
    // 5분마다 스케줄 업데이트 (설정 변경 반영)
    setInterval(updateSchedules, 5 * 60 * 1000);
});

client.on('interactionCreate', async interaction => {
    // 슬래시 명령어 처리
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`${interaction.commandName}과 일치하는 명령어를 찾을 수 없습니다.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            const errorMessage = { 
                content: '❌ 명령 실행 중 오류가 발생했습니다!', 
                flags: MessageFlags.Ephemeral,
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }
    
    // 모달 제출 처리
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'addAgendaModal' || interaction.customId.startsWith('addAgendaModal:')) {
            try {
                await handleAddAgendaModal(interaction);
                // 처리 완료 후 임시 데이터 정리
                clearPendingAssignees(interaction.user.id);
            } catch (error) {
                console.error('모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 안건 등록 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId.startsWith('addcheck_modal_')) {
            try {
                await handleAddCheckModal(interaction);
            } catch (error) {
                console.error('체크리스트 추가 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 체크리스트 항목 추가 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId === 'set_gemini_key') {
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                
                const apiKey = interaction.fields.getTextInputValue('gemini_key');
                
                // API 키 암호화 후 저장
                const encryptedKey = encrypt(apiKey);
                upsertGuildSettings(interaction.guildId, {
                    ai_api_key_encrypted: encryptedKey
                });
                
                await interaction.editReply({
                    content: '✅ Gemini API 키가 안전하게 저장되었습니다.\n`/testsummary` 명령어로 테스트해보세요.',
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                console.error('API 키 저장 중 오류:', error);
                const errorMessage = { 
                    content: '❌ API 키 저장 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        }
    }
    
    // 버튼 클릭 처리
    if (interaction.isButton()) {
        try {
            // /add 명령어의 다음 버튼 처리
            if (interaction.customId.startsWith('add_next_')) {
                await handleAddNext(interaction);
            } else {
                await handleButtonInteraction(interaction);
            }
        } catch (error) {
            console.error('버튼 처리 중 오류:', error);
            const errorMessage = { 
                content: '❌ 버튼 처리 중 오류가 발생했습니다!', 
                flags: MessageFlags.Ephemeral,
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }
    
    // 유저 선택 메뉴 처리
    if (interaction.isUserSelectMenu()) {
        try {
            if (interaction.customId.startsWith('add_assignees_')) {
                await handleUserSelect(interaction);
            }
        } catch (error) {
            console.error('사용자 선택 메뉴 처리 중 오류:', error);
            const errorMessage = { 
                content: '❌ 담당자 선택 중 오류가 발생했습니다!', 
                flags: MessageFlags.Ephemeral,
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }
    
    // 셀렉트 메뉴 처리
    if (interaction.isStringSelectMenu()) {
        try {
            await handleSelectMenuInteraction(interaction);
        } catch (error) {
            console.error('선택 메뉴 처리 중 오류:', error);
            const errorMessage = { 
                content: '❌ 상태 변경 중 오류가 발생했습니다!', 
                flags: MessageFlags.Ephemeral,
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

process.on('unhandledRejection', (reason) => {
    console.error('처리되지 않은 Promise 거부:', reason);
});
