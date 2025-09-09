import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    MessageFlags 
} from 'discord.js';
import { getTopic, updateTopicStatus } from '../db/database.js';
import { formatAgendaTitle, sanitizeMarkdown } from '../utils/formatter.js';
import { ensurePermissions } from '../utils/guards.js';

const STATUS_OPTIONS = [
    { name: '🧭 진행중', value: '진행중' },
    { name: '✅ 완료', value: '완료' },
    { name: '⏸️ 보류', value: '보류' },
    { name: '❌ 취소', value: '취소' },
    { name: '🔄 검토중', value: '검토중' },
    { name: '⏳ 대기중', value: '대기중' }
];

const STATUS_EMOJIS = {
    '진행중': '🧭',
    '완료': '✅',
    '보류': '⏸️',
    '취소': '❌',
    '검토중': '🔄',
    '대기중': '⏳'
};

export default {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('안건의 상태를 변경합니다')
        .addIntegerOption(option =>
            option.setName('id')
                .setDescription('안건 ID')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('status')
                .setDescription('변경할 상태')
                .setRequired(true)
                .addChoices(...STATUS_OPTIONS)
        ),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        const topicId = interaction.options.getInteger('id');
        const newStatus = interaction.options.getString('status');
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            // DB에서 안건 조회
            const topic = getTopic(topicId, interaction.guildId);
            
            if (!topic) {
                await interaction.editReply(`❌ 안건 #${topicId}을(를) 찾을 수 없습니다.`);
                return;
            }
            
            const oldStatus = topic.status;
            
            // 이미 같은 상태인 경우
            if (oldStatus === newStatus) {
                await interaction.editReply(`ℹ️ 안건 #${topicId}은(는) 이미 ${STATUS_EMOJIS[newStatus]} ${newStatus} 상태입니다.`);
                return;
            }
            
            // DB 상태 업데이트
            updateTopicStatus(topicId, newStatus);
            
            // 스레드 제목 업데이트
            if (topic.thread_id) {
                try {
                    const thread = await interaction.guild.channels.fetch(topic.thread_id);
                    if (thread) {
                        // 새로운 상태에 맞는 제목 생성
                        const emoji = STATUS_EMOJIS[newStatus] || '🧭';
                        const statusText = `${emoji} ${newStatus}`;
                        const prefix = `[${statusText}] #${topicId} `;
                        const MAX = 100;
                        const maxTitleLen = Math.max(0, MAX - prefix.length);
                        const trimmedTitle = topic.title.length > maxTitleLen
                            ? topic.title.slice(0, Math.max(0, maxTitleLen - 1)) + '…'
                            : topic.title;
                        const newTitle = `${prefix}${trimmedTitle}`;
                        
                        await thread.setName(newTitle);
                    }
                } catch (error) {
                    console.error('스레드 제목 업데이트 중 오류:', error);
                }
            }
            
            // 메시지 내용 업데이트 (제목과 상태 부분 변경)
            if (topic.message_id) {
                try {
                    const channel = await interaction.guild.channels.fetch(topic.channel_id);
                    const message = await channel.messages.fetch(topic.message_id);
                    
                    // 메시지 내용에서 제목과 상태 부분 업데이트
                    const lines = message.content.split('\n');
                    
                    // 제목 라인 업데이트 (첫 번째 라인이 # 안건으로 시작하는 경우)
                    if (lines[0].startsWith('# 안건')) {
                        // 기존 제목에서 안건 번호와 제목만 추출
                        const titleMatch = lines[0].match(/# 안건 #?(\d+)? ?: ?(.+)/);
                        if (titleMatch) {
                            const agendaId = titleMatch[1] || topicId;
                            const agendaTitle = titleMatch[2];
                            lines[0] = `# 안건 #${agendaId} : ${agendaTitle}`;
                        }
                    }
                    
                    // 상태 라인 업데이트
                    const statusLineIndex = lines.findIndex(line => line.startsWith('**상태**'));
                    if (statusLineIndex !== -1 && statusLineIndex + 1 < lines.length) {
                        lines[statusLineIndex + 1] = `${STATUS_EMOJIS[newStatus]} ${newStatus}`;
                    }
                    
                    await message.edit(lines.join('\n'));
                } catch (error) {
                    console.error('메시지 상태 업데이트 중 오류:', error);
                }
            }
            
            // 성공 응답
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('🔄 상태 변경 완료')
                .setDescription(`안건 #${topicId} "${sanitizeMarkdown(topic.title)}"의 상태가 변경되었습니다.`)
                .addFields(
                    { name: '이전 상태', value: `${STATUS_EMOJIS[oldStatus] || '🧭'} ${oldStatus}`, inline: true },
                    { name: '새 상태', value: `${STATUS_EMOJIS[newStatus]} ${newStatus}`, inline: true }
                )
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('안건 상태 변경 중 오류:', error);
            await interaction.editReply('❌ 안건 상태 변경 중 오류가 발생했습니다.');
        }
    },
};