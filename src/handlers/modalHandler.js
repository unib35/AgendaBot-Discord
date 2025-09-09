import { 
    EmbedBuilder, 
    MessageFlags, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} from 'discord.js';
import { addTopic, updateTopicThreadId, getGuildSettings } from '../db/database.js';
import { formatAgendaTitle, sanitizeMarkdown, createAgendaCard, getChecklistProgress } from '../utils/formatter.js';

export async function handleAddAgendaModal(interaction) {
    // customId에서 담당자 ID 추출
    const [modalType, assigneeIdsStr] = interaction.customId.split(':');
    const assigneeIds = assigneeIdsStr ? assigneeIdsStr.split(',').filter(Boolean) : [];
    
    // 모달에서 입력받은 값 가져오기
    const title = interaction.fields.getTextInputValue('agendaTitle');
    const background = interaction.fields.getTextInputValue('agendaBackground');
    const goal = interaction.fields.getTextInputValue('agendaGoal');
    const deadline = interaction.fields.getTextInputValue('agendaDeadline') || '미정';
    const notes = interaction.fields.getTextInputValue('agendaNotes') || '';
    
    // 담당자 멘션 생성
    const owner = assigneeIds.length > 0 
        ? assigneeIds.map(id => `<@${id}>`).join(' ') 
        : '@미정';
    
    // DB에서 길드 설정 가져오기
    const guildSettings = getGuildSettings(interaction.guildId);
    const channelId = guildSettings?.tracking_channel_id || process.env.TRACKING_CHANNEL_ID || interaction.channelId;
    
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    try {
        const channel = await interaction.guild.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
            await interaction.editReply('❌ 지정된 채널을 찾을 수 없거나 텍스트 채널이 아닙니다.');
            return;
        }
        
        // 먼저 임시 메시지 생성 (ID를 얻기 위해)
        const tempContent = `# 안건: ${title}\n\n잠시만 기다려주세요...`;
        const message = await channel.send(tempContent);
        
        // DB에 저장하여 ID 획득
        const topicId = addTopic({
            guild_id: interaction.guildId,
            channel_id: channelId,
            message_id: message.id,
            title: title,
            status: '진행중',
            created_by: interaction.user.id,
        });
        
        // ID를 포함한 포맷된 카드 내용 생성
        const content = createAgendaCard({
            id: topicId,
            title,
            background,
            goal,
            owner,
            deadline,
            notes
        });
        
        // 진행률 계산
        const progress = getChecklistProgress(content);
        const progressText = progress ? `\n**진행률**: ${progress.display}` : '';
        
        // 버튼 생성
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`complete_${topicId}`)
                    .setLabel('✅ 완료')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`status_${topicId}`)
                    .setLabel('🔄 상태 변경')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`addcheck_${topicId}`)
                    .setLabel('➕ 체크리스트 추가')
                    .setStyle(ButtonStyle.Primary)
            );
        
        // 메시지 업데이트 (진행률 포함, 멘션 허용)
        const contentWithProgress = content.replace('### 체크리스트', `${progressText}\n\n### 체크리스트`);
        await message.edit({ 
            content: contentWithProgress, 
            components: [row],
            allowedMentions: { users: assigneeIds, parse: [] }
        });
        
        // 스레드 생성
        const threadTitle = formatAgendaTitle(topicId, title, '진행중');
        const thread = await message.startThread({
            name: threadTitle,
            autoArchiveDuration: 10080,
            reason: `안건 #${topicId} 스레드 생성`,
        });
        
        // 스레드 ID 업데이트
        updateTopicThreadId(topicId, thread.id);
        
        // 스레드에 첫 댓글 남기기
        const firstComment = `이 스레드는 **안건 #${topicId} 전용 스레드**입니다
- 합의된 내용은 최종 댓글에 **3줄 요약**으로 남기고
- 본문 상태를 갱신해주세요
- 체크리스트는 본문에서만 수정합니다`;
        
        await thread.send(firstComment);
        
        // 성공 응답
        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ 안건 등록 완료')
            .setDescription(`안건 #${topicId} "${sanitizeMarkdown(title)}"이(가) 등록되었습니다.`)
            .addFields(
                { name: '스레드', value: `<#${thread.id}>`, inline: true },
                { name: '상태', value: '🧭 진행중', inline: true },
                { name: '담당자', value: owner, inline: true },
                { name: '마감일', value: deadline, inline: true }
            )
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('모달에서 안건 추가 중 오류:', error);
        await interaction.editReply('❌ 안건 등록 중 오류가 발생했습니다.');
    }
}