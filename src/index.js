import { 
    Client, 
    GatewayIntentBits, 
    Collection, 
    MessageFlags, 
    EmbedBuilder, 
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { config } from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import cron from 'node-cron';
import { initDatabase, getTopicsBetween, getGuildSettings, upsertGuildSettings, getAllGuildSettings } from './db/database.js';
import { 
    handleAddAgendaModal, 
    createAgenda, 
    clearPendingAgenda 
} from './handlers/modalHandler.js';
import { 
    handleChecklistSelect, 
    handleChecklistButton 
} from './handlers/checklistPanelHandler.js';
import { 
    handleDoneSelect, 
    handleDoneConfirm, 
    handleDoneCancel 
} from './handlers/doneSelectHandler.js';
import { 
    handleCheckAgendaSelect,
    handleCheckSelect as handleCheckItemSelect,
    handleCheckButton
} from './handlers/checkSelectHandler.js';
import { handleButtonInteraction, handleSelectMenuInteraction, handleAddCheckModal } from './handlers/buttonHandler.js';
import { 
    handleUserSelect, 
    handleAddNext, 
    clearPendingAssignees,
    handleAddStart,
    handleSkipAssignees,
    handleToDate,
    handleAddFinal,
    handleMeetingModal,
    handleSkipMeeting,
    clearAllPending,
    setPendingMeetingTime,
    setPendingReminderPolicy
} from './handlers/addAgendaHandler.js';
import { 
    handleDateSelect, 
    handleQuickDateButton, 
    handleDateInputModal,
    clearPendingDate 
} from './handlers/dateHandler.js';
import { summarizeForGuild } from './ai/summarize-gemini.js';
import { encrypt, decrypt } from './utils/secret.js';
import { processPendingReminders } from './services/reminderService.js';
import { scheduleChecklistPush } from './services/checklistPushService.js';

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

    // 리마인더 스케줄러 시작 (1분마다 검사)
    const reminderTimezone = process.env.TIMEZONE || 'Asia/Seoul';
    cron.schedule('* * * * *', async () => {
        try {
            const count = await processPendingReminders(client);
            if (count > 0) {
                console.log(`🔔 ${count}건의 리마인더를 전송했습니다`);
            }
        } catch (error) {
            console.error('리마인더 처리 중 오류:', error);
        }
    }, { timezone: reminderTimezone });

    // 체크리스트 푸시 스케줄러 시작
    scheduleChecklistPush(client);
    
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
                    
                    // 메시지 내용 가져오기 (선택적)
                    const messages = {};
                    for (const topic of topics.slice(0, 10)) {
                        try {
                            const channel = await guild.channels.fetch(topic.channel_id);
                            if (channel?.isTextBased()) {
                                const msg = await channel.messages.fetch(topic.message_id);
                                if (msg) messages[topic.message_id] = msg.content;
                            }
                        } catch (e) {
                            // 메시지를 가져올 수 없으면 무시
                        }
                    }
                    
                    // 새로운 summarizeForGuild 함수 사용
                    const aiSummary = await summarizeForGuild(topics, messages, settings);
                    
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
    // 자동완성 처리
    if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        
        if (!command) {
            console.error(`${interaction.commandName}과 일치하는 명령어를 찾을 수 없습니다.`);
            return;
        }
        
        if (!command.autocomplete) {
            console.error(`${interaction.commandName} 명령어에 autocomplete 함수가 없습니다.`);
            return;
        }
        
        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error('자동완성 처리 중 오류:', error);
            await interaction.respond([]);
        }
    }
    
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
            console.error('명령어 실행 오류:', error);
            const errorMessage = { 
                content: '❌ 명령 실행 중 오류가 발생했습니다!', 
                flags: MessageFlags.Ephemeral,
            };
            
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            } catch (replyError) {
                // 이미 응답했거나 타임아웃된 경우 무시
                console.error('에러 메시지 전송 실패:', replyError.message);
            }
        }
    }
    
    // 모달 제출 처리
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'addAgendaModal' || interaction.customId.startsWith('addAgendaModal:')) {
            try {
                await handleAddAgendaModal(interaction);
                // 처리 완료 후 임시 데이터 정리
                clearAllPending(interaction.user.id);
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
        } else if (interaction.customId.startsWith('date_input_modal:')) {
            try {
                await handleDateInputModal(interaction);
            } catch (error) {
                console.error('날짜 입력 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 날짜 입력 중 오류가 발생했습니다!', 
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
        } else if (interaction.customId.startsWith('checklist_input_')) {
            try {
                const input = interaction.fields.getTextInputValue('checklist_items');
                const items = input.split('\n').filter(item => item.trim()).map(item => item.trim());
                
                // 안건 생성
                await createAgenda(interaction, items);
                
                // 임시 데이터 정리
                clearPendingAgenda(interaction.user.id);
                clearPendingAssignees(interaction.user.id);
                clearPendingDate(interaction.user.id);
            } catch (error) {
                console.error('체크리스트 입력 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 체크리스트 입력 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId.startsWith('addcheck_modal:')) {
            // 체크리스트 추가 모달 처리
            try {
                const { handleAddcheckModal } = await import('./handlers/addcheckSelectHandler.js');
                await handleAddcheckModal(interaction);
            } catch (error) {
                console.error('체크리스트 추가 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 체크리스트 추가 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId.startsWith('link_modal:')) {
            // 링크 모달 처리
            try {
                const { handleLinkModal } = await import('./handlers/linkHandler.js');
                await handleLinkModal(interaction);
            } catch (error) {
                console.error('링크 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 링크 추가 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId === 'link_batch_modal') {
            // 링크 일괄 모달 처리
            try {
                const { handleLinkBatchModal } = await import('./handlers/linkHandler.js');
                await handleLinkBatchModal(interaction);
            } catch (error) {
                console.error('링크 일괄 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 링크 일괄 추가 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId.startsWith('clear_modal:')) {
            // 삭제 확인 모달 처리
            try {
                const { handleClearModal } = await import('./handlers/clearHandler.js');
                await handleClearModal(interaction);
            } catch (error) {
                console.error('삭제 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 삭제 처리 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId === 'template_add_key_modal') {
            // 템플릿 키 입력 모달 처리
            try {
                const { handleTemplateAddKeyModal } = await import('./handlers/templateHandler.js');
                await handleTemplateAddKeyModal(interaction);
            } catch (error) {
                console.error('템플릿 키 입력 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 템플릿 추가 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId === 'template_add_content_modal') {
            // 템플릿 내용 입력 모달 처리
            try {
                const { handleTemplateAddContentModal } = await import('./handlers/templateHandler.js');
                await handleTemplateAddContentModal(interaction);
            } catch (error) {
                console.error('템플릿 내용 입력 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 템플릿 추가 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId === 'template_search_modal') {
            // 템플릿 검색 모달 처리
            try {
                const { handleTemplateSearchModal } = await import('./handlers/templateHandler.js');
                await handleTemplateSearchModal(interaction);
            } catch (error) {
                console.error('템플릿 검색 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 템플릿 검색 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId.startsWith('template_update_modal:')) {
            // 템플릿 업데이트 모달 처리
            try {
                const { handleTemplateUpdateModal } = await import('./handlers/templateHandler.js');
                await handleTemplateUpdateModal(interaction);
            } catch (error) {
                console.error('템플릿 업데이트 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 템플릿 업데이트 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId.startsWith('edit_title_modal:')) {
            // 수정 제목 모달 처리
            try {
                const { handleEditTitleModal } = await import('./handlers/editHandler.js');
                await handleEditTitleModal(interaction);
            } catch (error) {
                console.error('제목 수정 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 제목 수정 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId.startsWith('edit_body_modal:')) {
            // 수정 내용 모달 처리
            try {
                const { handleEditBodyModal } = await import('./handlers/editHandler.js');
                await handleEditBodyModal(interaction);
            } catch (error) {
                console.error('내용 수정 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 내용 수정 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId.startsWith('edit_checklist_modal:')) {
            // 수정 체크리스트 모달 처리
            try {
                const { handleEditChecklistModal } = await import('./handlers/editHandler.js');
                await handleEditChecklistModal(interaction);
            } catch (error) {
                console.error('체크리스트 수정 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 체크리스트 수정 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId.startsWith('edit_date_modal:')) {
            // 수정 날짜 모달 처리
            try {
                const { handleEditDateModal } = await import('./handlers/editHandler.js');
                await handleEditDateModal(interaction);
            } catch (error) {
                console.error('날짜 수정 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 날짜 수정 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId.startsWith('reminder_custom_modal_')) {
            // 커스텀 리마인더 시간 모달 처리
            const { handleCustomTimeModal } = await import('./handlers/addAgendaHandler.js');
            await handleCustomTimeModal(interaction);
        } else if (interaction.customId.startsWith('add_meeting_time_')) {
            // 회의 시간 모달 제출 처리
            try {
                const userId = interaction.customId.replace('add_meeting_time_', '');
                const dateStr = interaction.fields.getTextInputValue('meetingDate');
                const timeStr = interaction.fields.getTextInputValue('meetingTime');
                const reminderPolicy = interaction.fields.getTextInputValue('reminderPolicy') || 'default';

                // 입력값 형식 검증
                const datePattern = /^\d{4}-\d{2}-\d{2}$/;
                const timePattern = /^\d{2}:\d{2}$/;

                if (!datePattern.test(dateStr) || !timePattern.test(timeStr)) {
                    await interaction.reply({
                        content: '❌ 날짜는 YYYY-MM-DD, 시간은 HH:MM 형식으로 입력해주세요.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // 리마인더 정책 검증
                const validPolicies = ['default', 'simple', 'all', 'off'];
                const policy = validPolicies.includes(reminderPolicy) ? reminderPolicy : 'default';

                // 날짜와 시간 파싱 (KST 기준)
                const meetingDateStr = `${dateStr}T${timeStr}:00+09:00`;
                const meetingDate = new Date(meetingDateStr);

                // 유효한 날짜인지 확인
                if (isNaN(meetingDate.getTime())) {
                    await interaction.reply({
                        content: '❌ 잘못된 날짜/시간입니다. 유효한 날짜를 입력해주세요.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // 과거 날짜 검증
                if (meetingDate.getTime() < Date.now()) {
                    await interaction.reply({
                        content: '❌ 과거 시간은 선택할 수 없습니다. 미래 시간을 입력해주세요.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // 임시 데이터 저장
                setPendingMeetingTime(userId, meetingDate.getTime());
                setPendingReminderPolicy(userId, policy);

                // 3단계: 리마인더 선택 화면으로 이동
                const { showReminderSelection } = await import('./handlers/addAgendaHandler.js');
                await showReminderSelection(interaction);
            } catch (error) {
                console.error('회의 시간 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 회의 시간 설정 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId.startsWith('template_use_variables:')) {
            // 템플릿 변수 입력 모달 처리
            try {
                const { handleTemplateVariablesModal } = await import('./handlers/templateHandler.js');
                await handleTemplateVariablesModal(interaction);
            } catch (error) {
                console.error('템플릿 변수 입력 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 템플릿 사용 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId === 'summary_custom_modal') {
            // 요약 사용자 지정 기간 모달 처리
            try {
                const { handleSummaryCustomModal } = await import('./handlers/summaryHandler.js');
                await handleSummaryCustomModal(interaction);
            } catch (error) {
                console.error('요약 사용자 지정 기간 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 요약 기간 설정 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId.startsWith('reminder_edit_submit_')) {
            // 리마인더 회의 시간 수정 모달 제출
            try {
                const topicId = parseInt(interaction.customId.replace('reminder_edit_submit_', ''));
                const dateStr = interaction.fields.getTextInputValue('meetingDate');
                const timeStr = interaction.fields.getTextInputValue('meetingTime');
                
                // 날짜와 시간 파싱
                const [year, month, day] = dateStr.split('-').map(Number);
                const [hour, minute] = timeStr.split(':').map(Number);
                
                const meetingDate = new Date(year, month - 1, day, hour, minute);
                
                if (isNaN(meetingDate.getTime())) {
                    await interaction.reply({
                        content: '❌ 잘못된 날짜/시간 형식입니다.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // 기존 리마인더 삭제 후 새로 생성
                const { updateTopicMeetingDate, removeTopicReminders, createDefaultReminders } = await import('./services/reminderService.js');
                await removeTopicReminders(topicId);
                await updateTopicMeetingDate(topicId, meetingDate.getTime());
                const reminders = await createDefaultReminders(topicId, meetingDate.getTime(), 'default');
                
                await interaction.reply({
                    content: `✅ 회의 시간이 업데이트되고 ${reminders.length}개의 새 리마인더가 생성되었습니다.\n회의 시간: ${meetingDate.toLocaleString('ko-KR')}`,
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                console.error('리마인더 수정 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 리마인더 수정 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId.startsWith('reminder_add_submit_')) {
            // 리마인더 추가 모달 제출
            try {
                const topicId = parseInt(interaction.customId.replace('reminder_add_submit_', ''));
                const dateStr = interaction.fields.getTextInputValue('meetingDate');
                const timeStr = interaction.fields.getTextInputValue('meetingTime');
                const reminderPolicy = interaction.fields.getTextInputValue('reminderPolicy') || 'default';
                
                // 날짜와 시간 파싱
                const [year, month, day] = dateStr.split('-').map(Number);
                const [hour, minute] = timeStr.split(':').map(Number);
                
                const meetingDate = new Date(year, month - 1, day, hour, minute);
                
                if (isNaN(meetingDate.getTime())) {
                    await interaction.reply({
                        content: '❌ 잘못된 날짜/시간 형식입니다.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // DB 업데이트
                const { updateTopicMeetingDate, createDefaultReminders } = await import('./services/reminderService.js');
                await updateTopicMeetingDate(topicId, meetingDate.getTime());
                
                // 리마인더 생성
                const reminders = await createDefaultReminders(topicId, meetingDate.getTime(), reminderPolicy);
                
                await interaction.reply({
                    content: `✅ 회의 일시가 설정되고 ${reminders.length}개의 리마인더가 생성되었습니다.\n회의 시간: ${meetingDate.toLocaleString('ko-KR')}`,
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                console.error('리마인더 추가 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 리마인더 추가 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId === 'stats_custom_modal') {
            // 통계 사용자 지정 기간 모달 처리
            try {
                const { handleStatsCustomModal } = await import('./handlers/statsHandler.js');
                await handleStatsCustomModal(interaction);
            } catch (error) {
                console.error('통계 사용자 지정 기간 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 통계 기간 설정 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        // 검색 모달들
        } else if (interaction.customId === 'search_keyword_modal') {
            // 검색 키워드 모달
            try {
                const { handleSearchKeywordModal } = await import('./handlers/searchHandler.js');
                await handleSearchKeywordModal(interaction);
            } catch (error) {
                console.error('검색 키워드 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 키워드 설정 중 오류가 발생했습니다!', 
                    flags: MessageFlags.Ephemeral,
                };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.customId === 'search_date_modal') {
            // 검색 날짜 범위 모달
            try {
                const { handleSearchDateModal } = await import('./handlers/searchHandler.js');
                await handleSearchDateModal(interaction);
            } catch (error) {
                console.error('검색 날짜 모달 처리 중 오류:', error);
                const errorMessage = { 
                    content: '❌ 날짜 설정 중 오류가 발생했습니다!', 
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
            // /add 명령어 관련 버튼 처리
            if (interaction.customId.startsWith('add_start_')) {
                await handleAddStart(interaction);
            } else if (interaction.customId.startsWith('add_next_')) {
                await handleAddNext(interaction);
            } else if (interaction.customId.startsWith('add_skip_assignees_')) {
                await handleSkipAssignees(interaction);
            } else if (interaction.customId.startsWith('add_to_date_')) {
                await handleToDate(interaction);
            } else if (interaction.customId.startsWith('add_final_')) {
                await handleAddFinal(interaction);
            } else if (interaction.customId.startsWith('add_meeting_modal_')) {
                await handleMeetingModal(interaction);
            } else if (interaction.customId.startsWith('add_skip_meeting_')) {
                await handleSkipMeeting(interaction);
            } else if (interaction.customId.startsWith('reminder_toggle_')) {
                // 커스텀 리마인더 토글 버튼
                const { handleReminderToggle } = await import('./handlers/addAgendaHandler.js');
                await handleReminderToggle(interaction);
            } else if (interaction.customId.startsWith('notification_')) {
                // 알림 방식 선택 버튼
                const { handleNotificationType } = await import('./handlers/addAgendaHandler.js');
                await handleNotificationType(interaction);
            } else if (interaction.customId.startsWith('add_reminder_continue_')) {
                // 리마인더 설정 완료 후 다음 단계
                const { handleReminderContinue } = await import('./handlers/addAgendaHandler.js');
                await handleReminderContinue(interaction);
            } else if (interaction.customId.startsWith('reminder_custom_time_')) {
                // 커스텀 시간 설정 버튼
                const { handleCustomTimeButton } = await import('./handlers/addAgendaHandler.js');
                await handleCustomTimeButton(interaction);
            } else if (interaction.customId.startsWith('reminder_preview_')) {
                // 리마인더 미리보기 버튼
                const { handleReminderPreview } = await import('./handlers/addAgendaHandler.js');
                await handleReminderPreview(interaction);
            } else if (interaction.customId.startsWith('date_quick:') || 
                       interaction.customId.startsWith('date_confirm:') ||
                       interaction.customId === 'date_custom') {
                await handleQuickDateButton(interaction);
            } else if (interaction.customId.startsWith('add_checklist_')) {
                // 체크리스트 추가 모달 표시
                const checklistModal = new ModalBuilder()
                    .setCustomId(`checklist_input_${interaction.user.id}`)
                    .setTitle('📝 체크리스트 항목 추가');
                
                const checklistInput = new TextInputBuilder()
                    .setCustomId('checklist_items')
                    .setLabel('체크리스트 항목 (한 줄에 하나씩)')
                    .setPlaceholder('작업 1\n작업 2\n작업 3')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(500);
                
                checklistModal.addComponents(
                    new ActionRowBuilder().addComponents(checklistInput)
                );
                
                await interaction.showModal(checklistModal);
            } else if (interaction.customId.startsWith('skip_checklist_')) {
                // 체크리스트 없이 바로 안건 생성
                await createAgenda(interaction, []);
                // 임시 데이터 정리
                clearPendingAgenda(interaction.user.id);
                clearPendingAssignees(interaction.user.id);
                clearPendingDate(interaction.user.id);
            } else if (interaction.customId.startsWith('ck:')) {
                // 체크리스트 패널 버튼 처리
                await handleChecklistButton(interaction);
            } else if (interaction.customId.startsWith('check_') && interaction.customId.includes(':')) {
                // check 체크리스트 버튼 처리
                await handleCheckButton(interaction);
            } else if (interaction.customId.startsWith('done_confirm:')) {
                // 완료 확인 버튼
                await handleDoneConfirm(interaction);
            } else if (interaction.customId === 'done_cancel') {
                // 완료 취소 버튼
                await handleDoneCancel(interaction);
            } else if (interaction.customId.startsWith('status_change:')) {
                // 상태 변경 버튼
                const { handleStatusChange } = await import('./handlers/statusSelectHandler.js');
                await handleStatusChange(interaction);
            } else if (interaction.customId === 'status_cancel') {
                // 상태 변경 취소 버튼
                const { handleStatusCancel } = await import('./handlers/statusSelectHandler.js');
                await handleStatusCancel(interaction);
            } else if (interaction.customId.startsWith('list:') && !interaction.customId.startsWith('list:jump:')) {
                // 리스트 버튼 처리
                const { handleListButton } = await import('./handlers/listHandler.js');
                await handleListButton(interaction);
            } else if (interaction.customId.startsWith('clear_next:')) {
                // 삭제 다음 단계 버튼
                const { handleClearNext } = await import('./handlers/clearHandler.js');
                await handleClearNext(interaction);
            } else if (interaction.customId.startsWith('clear_details:')) {
                // 삭제 상세 보기 버튼
                const { handleClearDetails } = await import('./handlers/clearHandler.js');
                await handleClearDetails(interaction);
            } else if (interaction.customId.startsWith('clear_execute:')) {
                // 삭제 실행 버튼
                const { handleClearExecute } = await import('./handlers/clearHandler.js');
                await handleClearExecute(interaction);
            } else if (interaction.customId.startsWith('clear_back:')) {
                // 삭제 이전 단계 버튼
                const { handleClearBack } = await import('./handlers/clearHandler.js');
                await handleClearBack(interaction);
            } else if (interaction.customId === 'clear_cancel') {
                // 삭제 취소 버튼
                const { handleClearCancel } = await import('./handlers/clearHandler.js');
                await handleClearCancel(interaction);
            } else if (interaction.customId.startsWith('link_quick:')) {
                // 링크 빠른 추가 버튼
                const { handleLinkQuick } = await import('./handlers/linkHandler.js');
                await handleLinkQuick(interaction);
            } else if (interaction.customId === 'link_batch') {
                // 링크 일괄 추가 버튼
                const { handleLinkBatch } = await import('./handlers/linkHandler.js');
                await handleLinkBatch(interaction);
            } else if (interaction.customId === 'link_template') {
                // 링크 템플릿 버튼
                const { handleLinkTemplate } = await import('./handlers/linkHandler.js');
                await handleLinkTemplate(interaction);
            } else if (interaction.customId === 'link_other') {
                // 링크 다른 안건 선택 버튼
                const { handleLinkOther } = await import('./handlers/linkHandler.js');
                await handleLinkOther(interaction);
            } else if (interaction.customId === 'link_cancel') {
                // 링크 취소 버튼
                const { handleLinkCancel } = await import('./handlers/linkHandler.js');
                await handleLinkCancel(interaction);
            } else if (interaction.customId.startsWith('template_use:')) {
                // 템플릿 사용 버튼
                const { handleTemplateUse } = await import('./handlers/templateHandler.js');
                await handleTemplateUse(interaction);
            } else if (interaction.customId.startsWith('template_update:')) {
                // 템플릿 수정 버튼
                const { handleTemplateUpdate } = await import('./handlers/templateHandler.js');
                await handleTemplateUpdate(interaction);
            } else if (interaction.customId.startsWith('template_delete:')) {
                // 템플릿 삭제 버튼
                const { handleTemplateDelete } = await import('./handlers/templateHandler.js');
                await handleTemplateDelete(interaction);
            } else if (interaction.customId === 'template_cancel') {
                // 템플릿 취소 버튼
                const { handleTemplateCancel } = await import('./handlers/templateHandler.js');
                await handleTemplateCancel(interaction);
            
            // 검색 관련 버튼들
            } else if (interaction.customId === 'search_keyword') {
                const { handleSearchKeyword } = await import('./handlers/searchHandler.js');
                await handleSearchKeyword(interaction);
            } else if (interaction.customId === 'search_status') {
                const { handleSearchStatus } = await import('./handlers/searchHandler.js');
                await handleSearchStatus(interaction);
            } else if (interaction.customId === 'search_assignee') {
                const { handleSearchAssignee } = await import('./handlers/searchHandler.js');
                await handleSearchAssignee(interaction);
            } else if (interaction.customId === 'search_date') {
                const { handleSearchDate } = await import('./handlers/searchHandler.js');
                await handleSearchDate(interaction);
            } else if (interaction.customId === 'search_execute') {
                const { handleSearchExecute } = await import('./handlers/searchHandler.js');
                await handleSearchExecute(interaction);
            } else if (interaction.customId === 'search_reset') {
                const { handleSearchReset } = await import('./handlers/searchHandler.js');
                await handleSearchReset(interaction);
            } else if (interaction.customId === 'search_cancel') {
                const { handleSearchCancel } = await import('./handlers/searchHandler.js');
                await handleSearchCancel(interaction);
            } else if (interaction.customId === 'search_first') {
                const { handleSearchFirst } = await import('./handlers/searchHandler.js');
                await handleSearchFirst(interaction);
            } else if (interaction.customId === 'search_prev') {
                const { handleSearchPrev } = await import('./handlers/searchHandler.js');
                await handleSearchPrev(interaction);
            } else if (interaction.customId === 'search_next') {
                const { handleSearchNext } = await import('./handlers/searchHandler.js');
                await handleSearchNext(interaction);
            } else if (interaction.customId === 'search_last') {
                const { handleSearchLast } = await import('./handlers/searchHandler.js');
                await handleSearchLast(interaction);
            } else if (interaction.customId === 'search_modify') {
                const { handleSearchModify } = await import('./handlers/searchHandler.js');
                await handleSearchModify(interaction);
            } else if (interaction.customId === 'search_sort') {
                const { handleSearchSort } = await import('./handlers/searchHandler.js');
                await handleSearchSort(interaction);
            } else if (interaction.customId === 'search_close') {
                const { handleSearchClose } = await import('./handlers/searchHandler.js');
                await handleSearchClose(interaction);
            } else if (interaction.customId === 'search_back_to_menu') {
                const { handleSearchBackToMenu } = await import('./handlers/searchHandler.js');
                await handleSearchBackToMenu(interaction);
            } else if (interaction.customId === 'search_back_to_results') {
                const { handleSearchBackToResults } = await import('./handlers/searchHandler.js');
                await handleSearchBackToResults(interaction);
            } else if (interaction.customId === 'template_add_new') {
                // 템플릿 새 템플릿 추가
                const { handleTemplateAddNew } = await import('./handlers/templateHandler.js');
                await handleTemplateAddNew(interaction);
            } else if (interaction.customId.startsWith('template_add_content:')) {
                // 템플릿 내용 입력 버튼
                const { handleTemplateAddContent } = await import('./handlers/templateHandler.js');
                await handleTemplateAddContent(interaction);
            } else if (interaction.customId === 'template_main_menu') {
                // 템플릿 메인 메뉴
                const { handleTemplateMainMenu } = await import('./handlers/templateHandler.js');
                await handleTemplateMainMenu(interaction);
            } else if (interaction.customId === 'template_list_all') {
                // 템플릿 전체 목록
                const { handleTemplateListAll } = await import('./handlers/templateHandler.js');
                await handleTemplateListAll(interaction);
            } else if (interaction.customId === 'template_help') {
                // 템플릿 도움말
                const { handleTemplateHelp } = await import('./handlers/templateHandler.js');
                await handleTemplateHelp(interaction);
            } else if (interaction.customId === 'template_search') {
                // 템플릿 검색
                const { handleTemplateSearch } = await import('./handlers/templateHandler.js');
                await handleTemplateSearch(interaction);
            } else if (interaction.customId.startsWith('template_view:')) {
                // 템플릿 상세보기
                const { handleTemplateView } = await import('./handlers/templateHandler.js');
                await handleTemplateView(interaction);
            } else if (interaction.customId.startsWith('template_delete_confirm:')) {
                // 템플릿 삭제 확인
                const { handleTemplateDeleteConfirm } = await import('./handlers/templateHandler.js');
                await handleTemplateDeleteConfirm(interaction);
            } else if (interaction.customId.startsWith('template_list:')) {
                // 템플릿 리스트 네비게이션
                const { handleTemplateListNavigation } = await import('./handlers/templateHandler.js');
                await handleTemplateListNavigation(interaction);
            } else if (interaction.customId.startsWith('edit_title:')) {
                // 수정 제목 버튼
                const { handleEditTitle } = await import('./handlers/editHandler.js');
                await handleEditTitle(interaction);
            } else if (interaction.customId.startsWith('edit_body:')) {
                // 수정 내용 버튼
                const { handleEditBody } = await import('./handlers/editHandler.js');
                await handleEditBody(interaction);
            } else if (interaction.customId.startsWith('edit_checklist:')) {
                // 수정 체크리스트 버튼
                const { handleEditChecklist } = await import('./handlers/editHandler.js');
                await handleEditChecklist(interaction);
            } else if (interaction.customId.startsWith('edit_assignees:')) {
                // 수정 담당자 버튼
                const { handleEditAssignees } = await import('./handlers/editHandler.js');
                await handleEditAssignees(interaction);
            } else if (interaction.customId.startsWith('edit_date:')) {
                // 수정 날짜 버튼
                const { handleEditDate } = await import('./handlers/editHandler.js');
                await handleEditDate(interaction);
            } else if (interaction.customId === 'edit_back') {
                // 수정 뒤로가기 버튼
                const { handleEditBack } = await import('./handlers/editHandler.js');
                await handleEditBack(interaction);
            } else if (interaction.customId === 'edit_cancel') {
                // 수정 취소 버튼
                const { handleEditCancel } = await import('./handlers/editHandler.js');
                await handleEditCancel(interaction);
            } else if (interaction.customId.startsWith('reminder_snooze_')) {
                // 리마인더 스누즈 버튼
                const { handleReminderSnooze } = await import('./handlers/reminderHandler.js');
                await handleReminderSnooze(interaction);
            } else if (interaction.customId.startsWith('reminder_dismiss_')) {
                // 리마인더 확인 버튼
                const { handleReminderDismiss } = await import('./handlers/reminderHandler.js');
                await handleReminderDismiss(interaction);

            // 오버듀 리마인더 버튼들
            } else if (interaction.customId.startsWith('overdue_send_anyway_')) {
                const reminderId = parseInt(interaction.customId.replace('overdue_send_anyway_', ''));
                await interaction.update({
                    content: '✅ 리마인더가 전송되었습니다.',
                    embeds: interaction.message.embeds,
                    components: []
                });
            } else if (interaction.customId.startsWith('overdue_snooze_')) {
                const reminderId = parseInt(interaction.customId.replace('overdue_snooze_', ''));
                const { updateReminderSchedule } = await import('./db/database.js');
                const newTime = Date.now() + (60 * 60 * 1000); // 1시간 후
                await updateReminderSchedule(reminderId, newTime);
                await interaction.update({
                    content: '⏰ 리마인더가 1시간 후로 스누즈되었습니다.',
                    embeds: [],
                    components: []
                });
            } else if (interaction.customId.startsWith('overdue_dismiss_')) {
                const reminderId = parseInt(interaction.customId.replace('overdue_dismiss_', ''));
                const { markReminderDelivered } = await import('./db/database.js');
                await markReminderDelivered(reminderId);
                await interaction.update({
                    content: '❌ 리마인더가 무시되었습니다.',
                    embeds: [],
                    components: []
                });

            // 리마인더 인터렉티브 UI 버튼들
            } else if (interaction.customId === 'reminder_list') {
                const { handleReminderList } = await import('./handlers/reminderInteractionHandler.js');
                await handleReminderList(interaction);
            } else if (interaction.customId === 'reminder_add') {
                const { handleReminderAdd } = await import('./handlers/reminderInteractionHandler.js');
                await handleReminderAdd(interaction);
            } else if (interaction.customId === 'reminder_manage') {
                const { handleReminderManage } = await import('./handlers/reminderInteractionHandler.js');
                await handleReminderManage(interaction);
            } else if (interaction.customId === 'reminder_settings') {
                const { handleReminderSettings } = await import('./handlers/reminderInteractionHandler.js');
                await handleReminderSettings(interaction);
            } else if (interaction.customId === 'reminder_cancel') {
                const { handleReminderCancel } = await import('./handlers/reminderInteractionHandler.js');
                await handleReminderCancel(interaction);
            } else if (interaction.customId === 'reminder_back') {
                const { handleReminderBack } = await import('./handlers/reminderInteractionHandler.js');
                await handleReminderBack(interaction);
            } else if (interaction.customId === 'reminder_refresh') {
                const { handleReminderRefresh } = await import('./handlers/reminderInteractionHandler.js');
                await handleReminderRefresh(interaction);
            } else if (interaction.customId.startsWith('reminder_edit_')) {
                const topicId = parseInt(interaction.customId.replace('reminder_edit_', ''));
                // 회의 시간 변경 모달 표시
                const modal = new ModalBuilder()
                    .setCustomId(`reminder_edit_submit_${topicId}`)
                    .setTitle('🕐 회의 일시 수정');
                
                const dateInput = new TextInputBuilder()
                    .setCustomId('meetingDate')
                    .setLabel('회의 날짜 (YYYY-MM-DD)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('예: 2025-01-20')
                    .setRequired(true)
                    .setMaxLength(10);
                
                const timeInput = new TextInputBuilder()
                    .setCustomId('meetingTime')
                    .setLabel('회의 시간 (HH:MM)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('예: 14:30')
                    .setRequired(true)
                    .setMaxLength(5);
                
                modal.addComponents(
                    new ActionRowBuilder().addComponents(dateInput),
                    new ActionRowBuilder().addComponents(timeInput)
                );
                
                await interaction.showModal(modal);
            } else if (interaction.customId.startsWith('reminder_delete_')) {
                const topicId = parseInt(interaction.customId.replace('reminder_delete_', ''));
                const { removeTopicReminders } = await import('./services/reminderService.js');
                const deletedCount = await removeTopicReminders(topicId);
                
                await interaction.update({
                    content: `✅ 안건 #${topicId}의 리마인더 ${deletedCount}개가 제거되었습니다.`,
                    embeds: [],
                    components: [],
                    flags: MessageFlags.Ephemeral
                });
            } else if (interaction.customId.startsWith('reminder_add_modal_')) {
                // 리마인더 추가 모달 표시
                const topicId = interaction.customId.replace('reminder_add_modal_', '');
                
                const modal = new ModalBuilder()
                    .setCustomId(`reminder_add_submit_${topicId}`)
                    .setTitle('🕐 회의 일시 설정');
                
                const dateInput = new TextInputBuilder()
                    .setCustomId('meetingDate')
                    .setLabel('회의 날짜 (YYYY-MM-DD)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('예: 2025-01-20')
                    .setRequired(true)
                    .setMaxLength(10);
                
                const timeInput = new TextInputBuilder()
                    .setCustomId('meetingTime')
                    .setLabel('회의 시간 (HH:MM)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('예: 14:30')
                    .setRequired(true)
                    .setMaxLength(5);
                
                const reminderInput = new TextInputBuilder()
                    .setCustomId('reminderPolicy')
                    .setLabel('리마인더 설정 (default/simple/all/off)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('default: 1일전,1시간전 / simple: 1시간전')
                    .setValue('default')
                    .setRequired(false)
                    .setMaxLength(10);
                
                modal.addComponents(
                    new ActionRowBuilder().addComponents(dateInput),
                    new ActionRowBuilder().addComponents(timeInput),
                    new ActionRowBuilder().addComponents(reminderInput)
                );
                
                await interaction.showModal(modal);
            } else if (interaction.customId === 'summary_today') {
                // 요약 오늘 버튼
                const { handleSummaryToday } = await import('./handlers/summaryHandler.js');
                await handleSummaryToday(interaction);
            } else if (interaction.customId === 'summary_this_week') {
                // 요약 이번 주 버튼
                const { handleSummaryThisWeek } = await import('./handlers/summaryHandler.js');
                await handleSummaryThisWeek(interaction);
            } else if (interaction.customId === 'summary_last_week') {
                // 요약 지난 주 버튼
                const { handleSummaryLastWeek } = await import('./handlers/summaryHandler.js');
                await handleSummaryLastWeek(interaction);
            } else if (interaction.customId === 'summary_this_month') {
                // 요약 이번 달 버튼
                const { handleSummaryThisMonth } = await import('./handlers/summaryHandler.js');
                await handleSummaryThisMonth(interaction);
            } else if (interaction.customId === 'summary_custom') {
                // 요약 사용자 지정 기간 버튼
                const { handleSummaryCustom } = await import('./handlers/summaryHandler.js');
                await handleSummaryCustom(interaction);
            } else if (interaction.customId === 'summary_cancel') {
                // 요약 취소 버튼
                const { handleSummaryCancel } = await import('./handlers/summaryHandler.js');
                await handleSummaryCancel(interaction);
            } else if (interaction.customId === 'summary_back') {
                // 요약 뒤로 버튼
                const { handleSummaryBack } = await import('./handlers/summaryHandler.js');
                await handleSummaryBack(interaction);
            } else if (interaction.customId === 'summary_post') {
                // 요약 게시 버튼
                const { handleSummaryPost } = await import('./handlers/summaryHandler.js');
                await handleSummaryPost(interaction);
            } else if (interaction.customId === 'summary_filter') {
                // 요약 필터 버튼
                const { handleSummaryFilter } = await import('./handlers/summaryHandler.js');
                await handleSummaryFilter(interaction);
            } else if (interaction.customId === 'summary_back_to_result') {
                // 요약 결과로 돌아가기 버튼
                const { handleSummaryBackToResult } = await import('./handlers/summaryHandler.js');
                await handleSummaryBackToResult(interaction);
            } else if (interaction.customId === 'summary_filter_cancel') {
                // 요약 필터 취소 버튼
                const { handleSummaryFilterCancel } = await import('./handlers/summaryHandler.js');
                await handleSummaryFilterCancel(interaction);
            } else if (interaction.customId.startsWith('panel_')) {
                // 컨트롤 패널 버튼
                const { handlePanelButton } = await import('./utils/controlPanel.js');
                await handlePanelButton(interaction);

            // 리마인더 대시보드 버튼 핸들러
            } else if (interaction.customId.startsWith('reminder_filter_')) {
                const { handleFilterButton } = await import('./handlers/reminderDashboard.js');
                await handleFilterButton(interaction);
            } else if (interaction.customId === 'reminder_page_prev' || interaction.customId === 'reminder_page_next') {
                const { handlePageButton } = await import('./handlers/reminderDashboard.js');
                await handlePageButton(interaction);
            } else if (interaction.customId === 'reminder_select_all' || interaction.customId === 'reminder_select_none') {
                const { handleSelectAll } = await import('./handlers/reminderDashboard.js');
                await handleSelectAll(interaction);
            } else if (interaction.customId.startsWith('reminder_snooze_')) {
                const { handleBulkSnooze } = await import('./handlers/reminderDashboard.js');
                await handleBulkSnooze(interaction);
            } else if (interaction.customId === 'reminder_delete_selected') {
                const { handleBulkDelete } = await import('./handlers/reminderDashboard.js');
                await handleBulkDelete(interaction);
            } else if (interaction.customId === 'reminder_main_menu') {
                // 메인 메뉴로 돌아가기
                const oldDashboard = await import('./handlers/reminderInteractionHandler.js');
                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('🔔 리마인더 관리')
                    .setDescription('리마인더를 관리할 작업을 선택하세요.')
                    .addFields(
                        { name: '📋 대시보드', value: '리마인더 필터링 및 일괄 관리', inline: false },
                        { name: '➕ 리마인더 추가', value: '안건에 회의 시간과 리마인더 설정', inline: false },
                        { name: '📝 안건별 리마인더', value: '특정 안건의 리마인더 관리', inline: false },
                        { name: '⚙️ 리마인더 설정', value: '전역 리마인더 정책 설정', inline: false }
                    )
                    .setFooter({ text: '원하는 작업 버튼을 클릭하세요' })
                    .setTimestamp();

                const buttons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('reminder_dashboard')
                        .setLabel('대시보드')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📋'),
                    new ButtonBuilder()
                        .setCustomId('reminder_add')
                        .setLabel('리마인더 추가')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('➕'),
                    new ButtonBuilder()
                        .setCustomId('reminder_manage')
                        .setLabel('안건별 관리')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📝'),
                    new ButtonBuilder()
                        .setCustomId('reminder_settings')
                        .setLabel('설정')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⚙️'),
                    new ButtonBuilder()
                        .setCustomId('reminder_cancel')
                        .setLabel('닫기')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('❌')
                );

                await interaction.update({
                    embeds: [embed],
                    components: [buttons],
                    flags: MessageFlags.Ephemeral
                });
            } else if (interaction.customId === 'reminder_dashboard') {
                // 대시보드 열기
                const { showReminderDashboard } = await import('./handlers/reminderDashboard.js');
                await showReminderDashboard(interaction, 'today', 0);

            // 반복 회의 버튼 핸들러
            } else if (interaction.customId.startsWith('add_recurrence_')) {
                const { showRecurrenceOptions } = await import('./handlers/recurringHandler.js');
                await showRecurrenceOptions(interaction);
            } else if (interaction.customId.startsWith('add_recurrence_none_')) {
                // 1회성 회의 - 바로 최종 등록으로
                const { handleAddAgendaModal } = await import('./handlers/addAgendaHandler.js');
                await interaction.update({
                    content: '✅ 안건을 생성하는 중...',
                    embeds: [],
                    components: [],
                    flags: MessageFlags.Ephemeral
                });
            } else if (interaction.customId.startsWith('recurrence_confirm_')) {
                const { handleRecurrenceConfirm } = await import('./handlers/recurringHandler.js');
                await handleRecurrenceConfirm(interaction);
            } else if (interaction.customId.startsWith('recurrence_preview_')) {
                const { handleRecurrencePreview } = await import('./handlers/recurringHandler.js');
                await handleRecurrencePreview(interaction);
            } else if (interaction.customId.startsWith('recurrence_cancel_')) {
                await interaction.update({
                    content: '❌ 반복 설정이 취소되었습니다.',
                    embeds: [],
                    components: [],
                    flags: MessageFlags.Ephemeral
                });
            } else if (interaction.customId === 'stats_today') {
                // 통계 오늘 버튼
                const { handleStatsToday } = await import('./handlers/statsHandler.js');
                await handleStatsToday(interaction);
            } else if (interaction.customId === 'stats_this_week') {
                // 통계 이번 주 버튼
                const { handleStatsThisWeek } = await import('./handlers/statsHandler.js');
                await handleStatsThisWeek(interaction);
            } else if (interaction.customId === 'stats_this_month') {
                // 통계 이번 달 버튼
                const { handleStatsThisMonth } = await import('./handlers/statsHandler.js');
                await handleStatsThisMonth(interaction);
            } else if (interaction.customId === 'stats_this_year') {
                // 통계 올해 버튼
                const { handleStatsThisYear } = await import('./handlers/statsHandler.js');
                await handleStatsThisYear(interaction);
            } else if (interaction.customId === 'stats_last_7days') {
                // 통계 지난 7일 버튼
                const { handleStatsLast7Days } = await import('./handlers/statsHandler.js');
                await handleStatsLast7Days(interaction);
            } else if (interaction.customId === 'stats_last_30days') {
                // 통계 지난 30일 버튼
                const { handleStatsLast30Days } = await import('./handlers/statsHandler.js');
                await handleStatsLast30Days(interaction);
            } else if (interaction.customId === 'stats_all_time') {
                // 통계 전체 기간 버튼
                const { handleStatsAllTime } = await import('./handlers/statsHandler.js');
                await handleStatsAllTime(interaction);
            } else if (interaction.customId === 'stats_custom') {
                // 통계 사용자 지정 기간 버튼
                const { handleStatsCustom } = await import('./handlers/statsHandler.js');
                await handleStatsCustom(interaction);
            } else if (interaction.customId === 'stats_compare') {
                // 통계 비교 버튼
                const { handleStatsCompare } = await import('./handlers/statsHandler.js');
                await handleStatsCompare(interaction);
            } else if (interaction.customId === 'stats_compare_week') {
                // 통계 주간 비교 버튼
                const { handleStatsCompareWeek } = await import('./handlers/statsHandler.js');
                await handleStatsCompareWeek(interaction);
            } else if (interaction.customId === 'stats_compare_month') {
                // 통계 월간 비교 버튼
                const { handleStatsCompareMonth } = await import('./handlers/statsHandler.js');
                await handleStatsCompareMonth(interaction);
            } else if (interaction.customId === 'stats_cancel') {
                // 통계 취소 버튼
                const { handleStatsCancel } = await import('./handlers/statsHandler.js');
                await handleStatsCancel(interaction);
            } else if (interaction.customId === 'stats_back') {
                // 통계 뒤로 버튼
                const { handleStatsBack } = await import('./handlers/statsHandler.js');
                await handleStatsBack(interaction);
            } else if (interaction.customId === 'stats_detail') {
                // 통계 상세 보기 버튼
                const { handleStatsDetail } = await import('./handlers/statsHandler.js');
                await handleStatsDetail(interaction);
            } else if (interaction.customId === 'stats_post') {
                // 통계 게시 버튼
                const { handleStatsPost } = await import('./handlers/statsHandler.js');
                await handleStatsPost(interaction);
            } else if (interaction.customId === 'stats_back_to_result') {
                // 통계 결과로 돌아가기 버튼
                const { handleStatsBackToResult } = await import('./handlers/statsHandler.js');
                await handleStatsBackToResult(interaction);
            } else {
                await handleButtonInteraction(interaction);
            }
        } catch (error) {
            console.error('버튼 처리 중 오류:', error);
            const errorMessage = { 
                content: '❌ 버튼 처리 중 오류가 발생했습니다!', 
                flags: MessageFlags.Ephemeral,
            };
            
            // 이미 응답한 상태인지 확인
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            } catch (replyError) {
                // 이미 응답되었거나 타임아웃된 경우 무시
                console.error('Error message 전송 실패 (이미 응답됨):', replyError.message);
            }
        }
    }
    
    // 유저 선택 메뉴 처리
    if (interaction.isUserSelectMenu()) {
        try {
            if (interaction.customId.startsWith('add_assignees_')) {
                await handleUserSelect(interaction);
            } else if (interaction.customId.startsWith('edit_assignees_select:')) {
                // 수정 담당자 선택 메뉴
                const { handleEditAssigneesSelect } = await import('./handlers/editHandler.js');
                await handleEditAssigneesSelect(interaction);
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
            // 날짜 선택 메뉴 처리
            if (interaction.customId.startsWith('add_date_select_')) {
                await handleDateSelect(interaction);
            } else if (interaction.customId.startsWith('reminder_preset_')) {
                // 리마인더 프리셋 선택 메뉴
                const { handleReminderPreset } = await import('./handlers/addAgendaHandler.js');
                await handleReminderPreset(interaction);
            } else if (interaction.customId.startsWith('ck:select:')) {
                // 체크리스트 패널 선택 처리
                await handleChecklistSelect(interaction);
            } else if (interaction.customId === 'done_select') {
                // 완료 선택 메뉴
                await handleDoneSelect(interaction);
            } else if (interaction.customId === 'check_agenda_select') {
                // 체크리스트 안건 선택 메뉴
                await handleCheckAgendaSelect(interaction);
            } else if (interaction.customId.startsWith('check_select:')) {
                // 체크리스트 항목 선택 메뉴
                await handleCheckItemSelect(interaction);
            } else if (interaction.customId === 'status_agenda_select') {
                // 상태 변경 안건 선택 메뉴
                const { handleStatusAgendaSelect } = await import('./handlers/statusSelectHandler.js');
                await handleStatusAgendaSelect(interaction);
            } else if (interaction.customId === 'addcheck_agenda_select') {
                // 체크리스트 추가 안건 선택 메뉴
                const { handleAddcheckAgendaSelect } = await import('./handlers/addcheckSelectHandler.js');
                await handleAddcheckAgendaSelect(interaction);
            } else if (interaction.customId.startsWith('list:jump:')) {
                // 리스트 페이지 점프 메뉴
                const { handleListJump } = await import('./handlers/listHandler.js');
                await handleListJump(interaction);
            } else if (interaction.customId.startsWith('list:filter:')) {
                // 리스트 필터 메뉴
                const { handleListFilter } = await import('./handlers/listHandler.js');
                await handleListFilter(interaction);
            } else if (interaction.customId === 'clear_topic_select') {
                // 삭제 안건 선택 메뉴
                const { handleClearTopicSelect } = await import('./handlers/clearHandler.js');
                await handleClearTopicSelect(interaction);
            } else if (interaction.customId === 'link_agenda_select') {
                // 링크 안건 선택 메뉴
                const { handleLinkAgendaSelect } = await import('./handlers/linkHandler.js');
                await handleLinkAgendaSelect(interaction);
            } else if (interaction.customId === 'search_status_select') {
                // 검색 상태 선택
                const { handleSearchStatusSelect } = await import('./handlers/searchHandler.js');
                await handleSearchStatusSelect(interaction);
            } else if (interaction.customId === 'search_assignee_select') {
                // 검색 담당자 선택
                const { handleSearchAssigneeSelect } = await import('./handlers/searchHandler.js');
                await handleSearchAssigneeSelect(interaction);
            } else if (interaction.customId === 'search_sort_select') {
                // 검색 정렬 선택
                const { handleSearchSortSelect } = await import('./handlers/searchHandler.js');
                await handleSearchSortSelect(interaction);
            } else if (interaction.customId === 'edit_topic_select') {
                // 수정 안건 선택 메뉴
                const { handleEditTopicSelect } = await import('./handlers/editHandler.js');
                await handleEditTopicSelect(interaction);
            } else if (interaction.customId === 'template_quick_use') {
                // 템플릿 빠른 사용
                const { handleTemplateQuickUse } = await import('./handlers/templateHandler.js');
                await handleTemplateQuickUse(interaction);
            } else if (interaction.customId === 'template_select_action') {
                // 템플릿 선택 액션
                const { handleTemplateSelectAction } = await import('./handlers/templateHandler.js');
                await handleTemplateSelectAction(interaction);
            } else if (interaction.customId === 'summary_filter_select') {
                // 요약 필터 선택 메뉴
                const { handleSummaryFilterSelect } = await import('./handlers/summaryHandler.js');
                await handleSummaryFilterSelect(interaction);
            } else if (interaction.customId === 'reminder_topic_select') {
                // 리마인더 안건 선택
                const selectedValue = interaction.values[0];
                const topicId = parseInt(selectedValue.replace('reminder_select_', ''));
                const { handleReminderDetail } = await import('./handlers/reminderInteractionHandler.js');
                await handleReminderDetail(interaction, topicId);
            } else if (interaction.customId === 'reminder_manage_select') {
                // 리마인더 관리 안건 선택
                const selectedValue = interaction.values[0];
                const topicId = parseInt(selectedValue.replace('reminder_manage_', ''));
                const { handleReminderDetail } = await import('./handlers/reminderInteractionHandler.js');
                await handleReminderDetail(interaction, topicId);
            } else if (interaction.customId === 'reminder_select_items') {
                // 리마인더 대시보드 아이템 선택
                const { handleSelectItems } = await import('./handlers/reminderDashboard.js');
                await handleSelectItems(interaction);
            } else if (interaction.customId.startsWith('recurrence_pattern_')) {
                // 반복 패턴 선택
                const { handleRecurrencePattern } = await import('./handlers/recurringHandler.js');
                await handleRecurrencePattern(interaction);
            } else {
                await handleSelectMenuInteraction(interaction);
            }
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
