import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    MessageFlags
} from 'discord.js';
import { getRemindersByTopic } from '../db/database.js';

/**
 * 안건 컨트롤 패널 생성
 */
export async function createControlPanel(topic) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎛️ 안건 관리 패널')
        .setDescription(`**안건 #${topic.id}**: ${topic.title}`)
        .addFields(
            { name: '현재 상태', value: getStatusEmoji(topic.status) + ' ' + topic.status, inline: true },
            { name: '생성일', value: new Date(topic.created_at).toLocaleDateString('ko-KR'), inline: true }
        )
        .setFooter({ text: '아래 버튼을 사용하여 안건을 관리하세요' });

    // 리마인더 정보 추가
    if (topic.meeting_date) {
        const reminders = getRemindersByTopic(topic.id);
        const meetingDate = new Date(topic.meeting_date);

        let reminderText = `📅 ${meetingDate.toLocaleString('ko-KR')}\n`;

        if (reminders && reminders.length > 0) {
            const pendingReminders = reminders.filter(r => !r.delivered_at);
            const deliveredReminders = reminders.filter(r => r.delivered_at);

            reminderText += `🔔 예정: ${pendingReminders.length}개`;
            if (deliveredReminders.length > 0) {
                reminderText += ` | ✅ 전송됨: ${deliveredReminders.length}개`;
            }

            // 예정된 리마인더 시간 표시
            if (pendingReminders.length > 0) {
                reminderText += '\n';
                const reminderTimes = pendingReminders.map(r => {
                    const time = new Date(r.scheduled_at);
                    const type = formatReminderType(r.type);
                    return `• ${type}`;
                }).slice(0, 3).join('\n');
                reminderText += reminderTimes;
                if (pendingReminders.length > 3) {
                    reminderText += `\n...외 ${pendingReminders.length - 3}개`;
                }
            }
        } else {
            reminderText += '🔕 리마인더 없음';
        }

        embed.addFields({
            name: '회의 일시 및 리마인더',
            value: reminderText,
            inline: false
        });
    }
    
    const components = [];
    
    // 상태 변경 버튼들 (첫 번째 행)
    const statusButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`panel_status:${topic.id}:진행중`)
            .setLabel('진행중')
            .setStyle(topic.status === '진행중' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setEmoji('🧭')
            .setDisabled(topic.status === '진행중'),
        
        new ButtonBuilder()
            .setCustomId(`panel_status:${topic.id}:완료`)
            .setLabel('완료')
            .setStyle(topic.status === '완료' ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji('✅')
            .setDisabled(topic.status === '완료'),
        
        new ButtonBuilder()
            .setCustomId(`panel_status:${topic.id}:보류`)
            .setLabel('보류')
            .setStyle(topic.status === '보류' ? ButtonStyle.Secondary : ButtonStyle.Secondary)
            .setEmoji('⏸️')
            .setDisabled(topic.status === '보류'),
        
        new ButtonBuilder()
            .setCustomId(`panel_status:${topic.id}:취소`)
            .setLabel('취소')
            .setStyle(topic.status === '취소' ? ButtonStyle.Danger : ButtonStyle.Secondary)
            .setEmoji('❌')
            .setDisabled(topic.status === '취소')
    );
    
    components.push(statusButtons);
    
    // 액션 버튼들 (두 번째 행)
    const actionButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`panel_checklist:${topic.id}`)
            .setLabel('체크리스트 관리')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📋'),
        
        new ButtonBuilder()
            .setCustomId(`panel_link:${topic.id}`)
            .setLabel('회의록 링크')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔗'),
        
        new ButtonBuilder()
            .setCustomId(`panel_refresh:${topic.id}`)
            .setLabel('새로고침')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄')
    );
    
    components.push(actionButtons);
    
    return { embed, components };
}

/**
 * 상태별 이모지 반환
 */
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

/**
 * 리마인더 타입 포맷팅
 */
function formatReminderType(type) {
    // 커스텀 시간 형식 처리
    const customMatch = type.match(/^(\d+)([mhd])$/);
    if (customMatch) {
        const [, num, unit] = customMatch;
        const unitText = { m: '분', h: '시간', d: '일' }[unit];
        return `${num}${unitText} 전`;
    }

    // 프리셋 타입 처리
    const typeMap = {
        'before-1d': '1일 전 (09:00)',
        'before-3h': '3시간 전',
        'before-1h': '1시간 전',
        'on-time': '정시',
        'overdue': '연체'
    };

    return typeMap[type] || type;
}

/**
 * 컨트롤 패널 버튼 처리
 */
export async function handlePanelButton(interaction) {
    if (!interaction.customId.startsWith('panel_')) return;
    
    const parts = interaction.customId.split(':');
    const action = parts[0].replace('panel_', '');
    const topicId = parseInt(parts[1]);
    
    switch (action) {
        case 'status': {
            // 상태 변경
            const newStatus = parts[2];
            await handleStatusChange(interaction, topicId, newStatus);
            break;
        }
        
        case 'checklist': {
            // 체크리스트 패널 표시
            await showChecklistPanel(interaction, topicId);
            break;
        }
        
        case 'link': {
            // 회의록 링크 입력 모달
            await showLinkModal(interaction, topicId);
            break;
        }
        
        case 'refresh': {
            // 패널 새로고침
            await refreshPanel(interaction, topicId);
            break;
        }
    }
}

/**
 * 상태 변경 처리
 */
async function handleStatusChange(interaction, topicId, newStatus) {
    const { getTopic, updateTopicStatus } = await import('../db/database.js');
    const { formatAgendaTitle } = await import('./formatter.js');
    
    await interaction.deferUpdate();
    
    try {
        // 상태 업데이트
        updateTopicStatus(topicId, newStatus);
        const topic = getTopic(topicId);
        
        // 원본 메시지 업데이트
        const channel = await interaction.guild.channels.fetch(topic.channel_id);
        const message = await channel.messages.fetch(topic.message_id);
        
        let content = message.content;
        const statusEmoji = getStatusEmoji(newStatus);
        content = content.replace(/\*\*상태\*\*\n.*/, `**상태**\n${statusEmoji} ${newStatus}`);
        
        await message.edit({ content });
        
        // 스레드 제목 업데이트
        if (interaction.channel.isThread()) {
            const newTitle = formatAgendaTitle(topicId, topic.title, newStatus);
            await interaction.channel.setName(newTitle).catch(() => {});
        }
        
        // 패널 업데이트
        const { embed, components } = createControlPanel({ ...topic, status: newStatus });
        await interaction.editReply({
            embeds: [embed],
            components: components
        });
        
        // 상태 변경 알림
        await interaction.followUp({
            content: `✅ 안건 상태가 **${newStatus}**로 변경되었습니다.`,
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        console.error('상태 변경 중 오류:', error);
        await interaction.followUp({
            content: '❌ 상태 변경 중 오류가 발생했습니다.',
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 체크리스트 패널 표시
 */
async function showChecklistPanel(interaction, topicId) {
    const { postChecklistPanel } = await import('../handlers/checklistPanelHandler.js');
    const { getTopic } = await import('../db/database.js');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        // 먼저 안건이 존재하는지 확인
        const topic = getTopic(topicId);
        if (!topic) {
            await interaction.editReply({
                content: '❌ 안건을 찾을 수 없습니다.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // 스레드인지 확인
        if (!interaction.channel.isThread()) {
            await interaction.editReply({
                content: '⚠️ 체크리스트 패널은 안건 스레드에서만 생성할 수 있습니다.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        console.log(`\n체크리스트 패널 생성 시작: 안건 #${topicId}`);
        const panelMessage = await postChecklistPanel(interaction.channel, topicId);

        if (panelMessage) {
            await interaction.editReply({
                content: '✅ 체크리스트 패널이 생성되었습니다. 스레드를 확인해주세요.',
                flags: MessageFlags.Ephemeral
            });
        } else {
            // 스레드에서 실제 안건 메시지 찾기
            try {
                const messages = await interaction.channel.messages.fetch({ limit: 20 });
                const agendaMessage = messages.find(msg =>
                    msg.content.includes(`# 안건 #${topicId}`) ||
                    (msg.content.includes('### 체크리스트') && msg.author.id === interaction.client.user.id)
                );

                let feedback = '⚠️ ';
                if (!agendaMessage) {
                    feedback += '안건 메시지를 찾을 수 없습니다.';
                } else {
                    const hasChecklistSection = agendaMessage.content.includes('### 체크리스트');
                    const hasCheckboxes = agendaMessage.content.includes('⬜') || agendaMessage.content.includes('☑️');

                    if (!hasChecklistSection) {
                        feedback += '안건에 체크리스트 셉션이 없습니다.';
                    } else if (!hasCheckboxes) {
                        feedback += '체크리스트 섹션은 있지만 항목이 없습니다. `/addcheck` 명령어로 항목을 추가해주세요.';
                    } else {
                        feedback += '체크리스트 파싱에 실패했습니다. 관리자에게 문의해주세요.';
                    }
                }

                await interaction.editReply({
                    content: feedback,
                    flags: MessageFlags.Ephemeral
                });
            } catch (err) {
                await interaction.editReply({
                    content: '⚠️ 체크리스트가 없거나 패널을 생성할 수 없습니다.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    } catch (error) {
        console.error('체크리스트 패널 생성 중 오류:', error);
        await interaction.editReply({
            content: `❌ 체크리스트 패널 생성 중 오류가 발생했습니다: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 회의록 링크 모달 표시
 */
async function showLinkModal(interaction, topicId) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
    
    const modal = new ModalBuilder()
        .setCustomId(`panel_link_modal:${topicId}`)
        .setTitle('🔗 회의록 링크 추가');
    
    const linkInput = new TextInputBuilder()
        .setCustomId('link_url')
        .setLabel('회의록 URL')
        .setPlaceholder('https://example.com/meeting-notes')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(linkInput)
    );
    
    await interaction.showModal(modal);
}

/**
 * 패널 새로고침
 */
async function refreshPanel(interaction, topicId) {
    const { getTopic } = await import('../db/database.js');
    
    await interaction.deferUpdate();
    
    try {
        const topic = getTopic(topicId);
        if (!topic) {
            await interaction.editReply({
                content: '❌ 안건을 찾을 수 없습니다.',
                embeds: [],
                components: []
            });
            return;
        }
        
        const { embed, components } = await createControlPanel(topic);
        await interaction.editReply({
            embeds: [embed],
            components: components
        });
        
    } catch (error) {
        console.error('패널 새로고침 중 오류:', error);
        await interaction.followUp({
            content: '❌ 새로고침 중 오류가 발생했습니다.',
            flags: MessageFlags.Ephemeral
        });
    }
}