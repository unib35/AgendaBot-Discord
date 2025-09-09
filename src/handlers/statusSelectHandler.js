import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from 'discord.js';
import { getTopic, updateTopicStatus } from '../db/database.js';
import { formatAgendaTitle, sanitizeMarkdown } from '../utils/formatter.js';

const STATUS_OPTIONS = [
    { label: '🧭 진행중', value: '진행중', emoji: '🧭', style: ButtonStyle.Primary },
    { label: '✅ 완료', value: '완료', emoji: '✅', style: ButtonStyle.Success },
    { label: '⏸️ 보류', value: '보류', emoji: '⏸️', style: ButtonStyle.Secondary },
    { label: '❌ 취소', value: '취소', emoji: '❌', style: ButtonStyle.Danger },
    { label: '🔄 검토중', value: '검토중', emoji: '🔄', style: ButtonStyle.Secondary },
    { label: '⏳ 대기중', value: '대기중', emoji: '⏳', style: ButtonStyle.Secondary }
];

/**
 * 안건 선택 후 상태 변경 패널 표시
 */
export async function handleStatusAgendaSelect(interaction) {
    if (interaction.customId !== 'status_agenda_select') return;
    
    const topicId = parseInt(interaction.values[0]);
    const topic = getTopic(topicId);
    
    if (!topic) {
        await interaction.update({
            content: '❌ 안건을 찾을 수 없습니다.',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 상태 변경 Embed 생성
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔄 상태 변경')
        .setDescription(`안건의 새로운 상태를 선택해주세요.`)
        .addFields(
            { name: '안건 번호', value: `#${topic.id}`, inline: true },
            { name: '제목', value: sanitizeMarkdown(topic.title), inline: false },
            { name: '현재 상태', value: getStatusEmoji(topic.status) + ' ' + topic.status, inline: true }
        )
        .setFooter({ text: '아래 버튼을 클릭하여 상태를 변경하세요' });
    
    // 상태 버튼들 생성 (2행으로 분할)
    const buttons1 = new ActionRowBuilder();
    const buttons2 = new ActionRowBuilder();
    
    STATUS_OPTIONS.forEach((option, index) => {
        const button = new ButtonBuilder()
            .setCustomId(`status_change:${topicId}:${option.value}`)
            .setLabel(option.label)
            .setStyle(option.style)
            .setDisabled(topic.status === option.value); // 현재 상태는 비활성화
        
        if (index < 3) {
            buttons1.addComponents(button);
        } else {
            buttons2.addComponents(button);
        }
    });
    
    // 취소 버튼 추가
    buttons2.addComponents(
        new ButtonBuilder()
            .setCustomId('status_cancel')
            .setLabel('취소')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔙')
    );
    
    await interaction.update({
        embeds: [embed],
        components: [buttons1, buttons2],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 상태 변경 버튼 처리
 */
export async function handleStatusChange(interaction) {
    if (!interaction.customId.startsWith('status_change:')) return;
    
    const parts = interaction.customId.split(':');
    const topicId = parseInt(parts[1]);
    const newStatus = parts[2];
    
    // 먼저 interaction 응답
    await interaction.update({
        content: '⏳ 상태를 변경하는 중입니다...',
        embeds: [],
        components: [],
        flags: MessageFlags.Ephemeral
    });
    
    const topic = getTopic(topicId);
    
    if (!topic) {
        await interaction.editReply({
            content: '❌ 안건을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    try {
        // 상태 업데이트
        updateTopicStatus(topicId, newStatus);
        
        // 원본 메시지 업데이트
        const channel = await interaction.guild.channels.fetch(topic.channel_id);
        if (channel && channel.isTextBased()) {
            const message = await channel.messages.fetch(topic.message_id).catch(() => null);
            
            if (message) {
                // 메시지 내용에서 상태 업데이트
                let content = message.content;
                const statusEmoji = getStatusEmoji(newStatus);
                content = content.replace(/\*\*상태\*\*\n.*/, `**상태**\n${statusEmoji} ${newStatus}`);
                
                await message.edit({ content });
                
                // 스레드 타이틀 업데이트
                if (topic.thread_id) {
                    const thread = await interaction.guild.channels.fetch(topic.thread_id).catch(() => null);
                    if (thread && thread.isThread()) {
                        const newTitle = formatAgendaTitle(topicId, topic.title, newStatus);
                        await thread.setName(newTitle).catch(() => {});
                        
                        // 상태 변경 메시지 스레드에 남기기
                        await thread.send({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(getStatusColor(newStatus))
                                    .setTitle('🔄 상태 변경')
                                    .setDescription(`안건 상태가 변경되었습니다.`)
                                    .addFields(
                                        { name: '이전 상태', value: topic.status, inline: true },
                                        { name: '새 상태', value: newStatus, inline: true },
                                        { name: '변경자', value: `<@${interaction.user.id}>`, inline: true }
                                    )
                                    .setTimestamp()
                            ]
                        });
                        
                        // 완료/취소인 경우 스레드 아카이브
                        if (newStatus === '완료' || newStatus === '취소') {
                            await thread.setArchived(true).catch(() => {});
                        }
                    }
                }
            }
        }
        
        // 성공 응답
        const successEmbed = new EmbedBuilder()
            .setColor(getStatusColor(newStatus))
            .setTitle('✅ 상태 변경 완료')
            .setDescription(`안건 #${topicId}의 상태가 변경되었습니다.`)
            .addFields(
                { name: '안건', value: sanitizeMarkdown(topic.title), inline: false },
                { name: '이전 상태', value: topic.status, inline: true },
                { name: '새 상태', value: newStatus, inline: true }
            )
            .setTimestamp();
        
        await interaction.editReply({
            content: null,
            embeds: [successEmbed],
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        console.error('상태 변경 중 오류:', error);
        await interaction.editReply({
            content: '❌ 상태 변경 중 오류가 발생했습니다.',
            embeds: [],
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 취소 버튼 처리
 */
export async function handleStatusCancel(interaction) {
    if (interaction.customId !== 'status_cancel') return;
    
    await interaction.update({
        content: '❌ 상태 변경이 취소되었습니다.',
        embeds: [],
        components: [],
        flags: MessageFlags.Ephemeral
    });
}

// 상태별 색상
function getStatusColor(status) {
    const colors = {
        '진행중': 0x5865F2,
        '완료': 0x00FF00,
        '보류': 0xFFA500,
        '취소': 0xFF0000,
        '검토중': 0x00BFFF,
        '대기중': 0xFFFF00
    };
    return colors[status] || 0x808080;
}

// 상태별 이모지
function getStatusEmoji(status) {
    const emojis = {
        '진행중': '🧭',
        '완료': '✅',
        '보류': '⏸️',
        '취소': '❌',
        '검토중': '🔄',
        '대기중': '⏳'
    };
    return emojis[status] || '📋';
}