import { 
    EmbedBuilder, 
    MessageFlags, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} from 'discord.js';
import { addTopic, updateTopicThreadId, getGuildSettings } from '../db/database.js';
import { formatAgendaTitle, sanitizeMarkdown, createAgendaCard, getChecklistProgress } from '../utils/formatter.js';

// 임시 저장소 (userId -> 안건 데이터)
const pendingAgendas = new Map();

export function getPendingAgenda(userId) {
    return pendingAgendas.get(userId);
}

export function setPendingAgenda(userId, data) {
    pendingAgendas.set(userId, data);
}

export function clearPendingAgenda(userId) {
    pendingAgendas.delete(userId);
}

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
    
    // 안건 데이터를 임시 저장
    setPendingAgenda(interaction.user.id, {
        title,
        background,
        goal,
        deadline,
        notes,
        assigneeIds,
        owner
    });
    
    // 4단계: 체크리스트 추가 여부 확인
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('✅ 4단계: 체크리스트 추가')
        .setDescription('안건에 체크리스트 항목을 추가하시겠습니까?\n체크리스트는 작업 진행상황을 추적하는데 유용합니다.')
        .addFields(
            { name: '제목', value: title, inline: false },
            { name: '담당자', value: owner, inline: true },
            { name: '마감일', value: deadline, inline: true }
        );
    
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`add_checklist_${interaction.user.id}`)
            .setLabel('체크리스트 추가')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝'),
        
        new ButtonBuilder()
            .setCustomId(`skip_checklist_${interaction.user.id}`)
            .setLabel('건너뛰기 (바로 등록)')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏩')
    );
    
    await interaction.reply({
        embeds: [embed],
        components: [buttons],
        flags: MessageFlags.Ephemeral
    });
}

// 실제 안건 생성 함수
export async function createAgenda(interaction, checklistItems = []) {
    const agendaData = getPendingAgenda(interaction.user.id);
    if (!agendaData) {
        await interaction.reply({ 
            content: '❌ 안건 데이터를 찾을 수 없습니다. 다시 시도해주세요.',
            flags: MessageFlags.Ephemeral 
        });
        return;
    }
    
    const { title, background, goal, deadline, notes, assigneeIds, owner } = agendaData;
    
    // DB에서 길드 설정 가져오기
    const guildSettings = getGuildSettings(interaction.guildId);
    const channelId = guildSettings?.tracking_channel_id || process.env.TRACKING_CHANNEL_ID || interaction.channelId;
    
    // interaction type에 따라 다르게 처리
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: '⏳ 안건을 생성하는 중입니다...' });
    } else {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    
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
        
        // 체크리스트 항목 포맷팅 (⬜ 사용)
        const checklistText = checklistItems.length > 0
            ? checklistItems.map(item => `⬜ ${item}`).join('\n')
            : null; // null이면 기본값 사용
        
        // ID를 포함한 포맷된 카드 내용 생성
        const content = createAgendaCard({
            id: topicId,
            title,
            background,
            goal,
            owner,
            deadline,
            notes,
            checklist: checklistText
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
        
        // 컨트롤 패널 자동 생성
        const { createControlPanel } = await import('../utils/controlPanel.js');
        const controlPanel = createControlPanel({
            id: topicId,
            title,
            status: '진행중',
            created_at: Math.floor(Date.now() / 1000)
        });
        
        await thread.send({
            embeds: [controlPanel.embed],
            components: controlPanel.components
        });
        
        // 체크리스트가 있으면 자동으로 패널 생성
        if (checklistItems.length > 0) {
            const { postChecklistPanel } = await import('./checklistPanelHandler.js');
            await postChecklistPanel(thread, topicId);
        }
        
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
        
        // 임시 데이터 정리
        clearPendingAgenda(interaction.user.id);
        
    } catch (error) {
        console.error('모달에서 안건 추가 중 오류:', error);
        await interaction.editReply('❌ 안건 등록 중 오류가 발생했습니다.');
    }
}