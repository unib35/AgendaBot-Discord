import { 
    EmbedBuilder, 
    MessageFlags,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { getTopic, updateTopicStatus } from '../db/database.js';
import { formatAgendaTitle, sanitizeMarkdown, replaceCheckboxes, getChecklistProgress, addChecklistItem } from '../utils/formatter.js';
import { ensurePermissions } from '../utils/guards.js';

const STATUS_OPTIONS = [
    { label: '🧭 진행중', value: '진행중', emoji: '🧭' },
    { label: '✅ 완료', value: '완료', emoji: '✅' },
    { label: '⏸️ 보류', value: '보류', emoji: '⏸️' },
    { label: '❌ 취소', value: '취소', emoji: '❌' },
    { label: '🔄 검토중', value: '검토중', emoji: '🔄' },
    { label: '⏳ 대기중', value: '대기중', emoji: '⏳' }
];

const STATUS_EMOJIS = {
    '진행중': '🧭',
    '완료': '✅',
    '보류': '⏸️',
    '취소': '❌',
    '검토중': '🔄',
    '대기중': '⏳'
};

export async function handleButtonInteraction(interaction) {
    const [action, topicId] = interaction.customId.split('_');
    
    // 권한 체크
    if (!await ensurePermissions(interaction)) return;
    
    switch (action) {
        case 'complete':
            await handleCompleteButton(interaction, parseInt(topicId));
            break;
        case 'status':
            await handleStatusButton(interaction, parseInt(topicId));
            break;
        case 'addcheck':
            await handleAddCheckButton(interaction, parseInt(topicId));
            break;
    }
}

async function handleCompleteButton(interaction, topicId) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    try {
        const topic = getTopic(topicId, interaction.guildId);
        
        if (!topic) {
            await interaction.editReply(`❌ 안건 #${topicId}을(를) 찾을 수 없습니다.`);
            return;
        }
        
        if (topic.status === '완료') {
            await interaction.editReply(`ℹ️ 안건 #${topicId}은(는) 이미 완료 상태입니다.`);
            return;
        }
        
        // DB 상태 업데이트
        updateTopicStatus(topicId, '완료');
        
        // 스레드 제목 업데이트
        if (topic.thread_id) {
            try {
                const thread = await interaction.guild.channels.fetch(topic.thread_id);
                if (thread) {
                    const newTitle = formatAgendaTitle(topicId, topic.title, '완료');
                    await thread.setName(newTitle);
                }
            } catch (error) {
                console.error('스레드 제목 업데이트 중 오류:', error);
            }
        }
        
        // 메시지 내용 업데이트
        const message = interaction.message;
        let updatedContent = replaceCheckboxes(message.content);
        
        // 상태 업데이트
        const lines = updatedContent.split('\n');
        const statusLineIndex = lines.findIndex(line => line.startsWith('**상태**'));
        if (statusLineIndex !== -1 && statusLineIndex + 1 < lines.length) {
            lines[statusLineIndex + 1] = '✅ 완료';
        }
        updatedContent = lines.join('\n');
        
        await message.edit(updatedContent);
        
        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ 안건 완료')
            .setDescription(`안건 #${topicId} "${sanitizeMarkdown(topic.title)}"이(가) 완료 처리되었습니다.`)
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('버튼으로 안건 완료 처리 중 오류:', error);
        await interaction.editReply('❌ 안건 완료 처리 중 오류가 발생했습니다.');
    }
}

async function handleStatusButton(interaction, topicId) {
    const topic = getTopic(topicId, interaction.guildId);
    
    if (!topic) {
        await interaction.reply({ 
            content: `❌ 안건 #${topicId}을(를) 찾을 수 없습니다.`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 드롭다운 메뉴 생성
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`status_select_${topicId}`)
        .setPlaceholder('변경할 상태를 선택하세요')
        .addOptions(STATUS_OPTIONS);
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.reply({
        content: `안건 #${topicId}의 상태를 변경합니다. (현재: ${STATUS_EMOJIS[topic.status]} ${topic.status})`,
        components: [row],
        flags: MessageFlags.Ephemeral
    });
}

async function handleAddCheckButton(interaction, topicId) {
    // 모달 생성
    const modal = new ModalBuilder()
        .setCustomId(`addcheck_modal_${topicId}`)
        .setTitle('체크리스트 항목 추가');
    
    const itemInput = new TextInputBuilder()
        .setCustomId('checkItem')
        .setLabel('추가할 체크리스트 항목')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('예: 디자인 레퍼런스 조사')
        .setRequired(true)
        .setMaxLength(100);
    
    const actionRow = new ActionRowBuilder().addComponents(itemInput);
    modal.addComponents(actionRow);
    
    await interaction.showModal(modal);
}

export async function handleSelectMenuInteraction(interaction) {
    if (!interaction.customId.startsWith('status_select_')) return;
    
    const topicId = parseInt(interaction.customId.replace('status_select_', ''));
    const newStatus = interaction.values[0];
    
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    try {
        const topic = getTopic(topicId, interaction.guildId);
        
        if (!topic) {
            await interaction.editReply(`❌ 안건 #${topicId}을(를) 찾을 수 없습니다.`);
            return;
        }
        
        const oldStatus = topic.status;
        
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
                    const newTitle = formatAgendaTitle(topicId, topic.title, newStatus);
                    await thread.setName(newTitle);
                }
            } catch (error) {
                console.error('스레드 제목 업데이트 중 오류:', error);
            }
        }
        
        // 원본 메시지 찾기 및 업데이트
        const channel = await interaction.guild.channels.fetch(topic.channel_id);
        const message = await channel.messages.fetch(topic.message_id);
        
        // 메시지 내용에서 상태 부분 업데이트
        const lines = message.content.split('\n');
        const statusLineIndex = lines.findIndex(line => line.startsWith('**상태**'));
        
        if (statusLineIndex !== -1 && statusLineIndex + 1 < lines.length) {
            lines[statusLineIndex + 1] = `${STATUS_EMOJIS[newStatus]} ${newStatus}`;
            await message.edit(lines.join('\n'));
        }
        
        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('🔄 상태 변경 완료')
            .setDescription(`안건 #${topicId} "${sanitizeMarkdown(topic.title)}"의 상태가 변경되었습니다.`)
            .addFields(
                { name: '이전 상태', value: `${STATUS_EMOJIS[oldStatus]} ${oldStatus}`, inline: true },
                { name: '새 상태', value: `${STATUS_EMOJIS[newStatus]} ${newStatus}`, inline: true }
            )
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('선택 메뉴로 상태 변경 중 오류:', error);
        await interaction.editReply('❌ 상태 변경 중 오류가 발생했습니다.');
    }
}

export async function handleAddCheckModal(interaction) {
    if (!interaction.customId.startsWith('addcheck_modal_')) return;
    
    const topicId = parseInt(interaction.customId.replace('addcheck_modal_', ''));
    const checkItem = interaction.fields.getTextInputValue('checkItem');
    
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    try {
        const topic = getTopic(topicId, interaction.guildId);
        
        if (!topic) {
            await interaction.editReply(`❌ 안건 #${topicId}을(를) 찾을 수 없습니다.`);
            return;
        }
        
        // 메시지 가져오기
        const channel = await interaction.guild.channels.fetch(topic.channel_id);
        const message = await channel.messages.fetch(topic.message_id);
        
        // 체크리스트 항목 추가
        const updatedContent = addChecklistItem(message.content, checkItem);
        
        // 진행률 재계산
        const progress = getChecklistProgress(updatedContent);
        let finalContent = updatedContent;
        
        // 기존 진행률 제거 및 새 진행률 추가
        const lines = finalContent.split('\n');
        const progressIndex = lines.findIndex(line => line.startsWith('**진행률**'));
        if (progressIndex !== -1) {
            lines.splice(progressIndex, 1);
        }
        
        const checklistIndex = lines.findIndex(line => line.includes('### 체크리스트'));
        if (checklistIndex !== -1 && progress) {
            lines.splice(checklistIndex, 0, '', `**진행률**: ${progress.display}`);
        }
        
        finalContent = lines.join('\n');
        await message.edit(finalContent);
        
        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('➕ 체크리스트 항목 추가')
            .setDescription(`안건 #${topicId}에 새 체크리스트 항목이 추가되었습니다.`)
            .addFields(
                { name: '추가된 항목', value: `⬜ ${checkItem}` },
                { name: '현재 진행률', value: progress ? progress.display : '0/0 (0%)' }
            )
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('체크리스트 항목 추가 중 오류:', error);
        await interaction.editReply('❌ 체크리스트 항목 추가 중 오류가 발생했습니다.');
    }
}