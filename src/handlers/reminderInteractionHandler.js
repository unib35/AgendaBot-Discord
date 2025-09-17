import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} from 'discord.js';
import { 
    getUpcomingReminders,
    getRemindersByTopic,
    removeTopicReminders,
    updateTopicMeetingDate,
    createDefaultReminders,
    getReminderPolicyText,
    markReminderDelivered,
    updateReminderSchedule,
    calculateSnoozeTime
} from '../services/reminderService.js';
import { getTopic, getTopics } from '../db/database.js';

// 세션 저장소
const reminderSessions = new Map();

// 필터 레이블 매핑
const FILTER_LABELS = {
    'today': '📅 오늘',
    'tomorrow': '📆 내일',
    'week': '📅 7일 이내',
    'snoozed': '⏰ 스누즈',
    'delivered': '✅ 전송 완료',
    'all': '📋 전체'
};

/**
 * 리마인더 메인 대시보드 표시
 */
export async function showReminderDashboard(interaction, isInitial = true) {
    // 새로운 대시보드로 리다이렉트
    const { showReminderDashboard: showNewDashboard } = await import('./reminderDashboard.js');

    if (isInitial) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await showNewDashboard(interaction, 'today', 0);
    } else {
        await showNewDashboard(interaction, 'today', 0);
    }
}

/**
 * 예정된 리마인더 목록 표시
 */
export async function handleReminderList(interaction) {
    await interaction.deferUpdate();
    
    const reminders = await getUpcomingReminders(interaction.guildId, 30);
    
    if (!reminders || reminders.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('📭 예정된 리마인더 없음')
            .setDescription('현재 예정된 리마인더가 없습니다.')
            .setTimestamp();
        
        const backButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('reminder_back')
                .setLabel('뒤로가기')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️')
        );
        
        await interaction.editReply({
            embeds: [embed],
            components: [backButton],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📋 예정된 리마인더')
        .setDescription(`총 **${reminders.length}개**의 리마인더가 예약되어 있습니다.`)
        .setFooter({ text: '가장 가까운 시간 순으로 정렬됨' })
        .setTimestamp();
    
    // 최대 10개만 표시
    const displayReminders = reminders.slice(0, 10);
    
    for (const reminder of displayReminders) {
        const date = new Date(reminder.scheduled_at);
        const now = new Date();
        const timeDiff = date - now;
        const hours = Math.floor(timeDiff / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        
        let timeText = '';
        if (days > 0) {
            timeText = `${days}일 ${hours % 24}시간 후`;
        } else if (hours > 0) {
            timeText = `${hours}시간 후`;
        } else {
            const minutes = Math.floor(timeDiff / (1000 * 60));
            timeText = `${minutes}분 후`;
        }
        
        const typeEmoji = {
            'before-1d': '📅',
            'before-3h': '⏰',
            'before-1h': '⚡',
            'on-time': '🔔',
            'overdue': '⚠️'
        }[reminder.type] || '📝';
        
        embed.addFields({
            name: `${typeEmoji} ${reminder.title || '제목 없음'}`,
            value: `⏰ ${date.toLocaleString('ko-KR')}\n📌 ${timeText}`,
            inline: true
        });
    }
    
    if (reminders.length > 10) {
        embed.addFields({
            name: '📄 더 보기',
            value: `외 ${reminders.length - 10}개의 리마인더가 더 있습니다.`,
            inline: false
        });
    }
    
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('reminder_refresh')
            .setLabel('새로고침')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔄'),
        new ButtonBuilder()
            .setCustomId('reminder_filter')
            .setLabel('필터')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔍'),
        new ButtonBuilder()
            .setCustomId('reminder_back')
            .setLabel('뒤로가기')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
    );
    
    await interaction.editReply({
        embeds: [embed],
        components: [buttons],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 리마인더 추가 - 안건 선택
 */
export async function handleReminderAdd(interaction) {
    await interaction.deferUpdate();
    
    // 진행중인 안건 목록 가져오기
    const topics = getTopics(interaction.guildId, '진행중');
    const topicsWithoutReminder = topics.filter(t => !t.meeting_date);
    
    if (!topicsWithoutReminder || topicsWithoutReminder.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('📭 리마인더 추가 가능한 안건 없음')
            .setDescription('진행중인 안건 중 회의 시간이 설정되지 않은 안건이 없습니다.')
            .setTimestamp();
        
        const backButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('reminder_back')
                .setLabel('뒤로가기')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️')
        );
        
        await interaction.editReply({
            embeds: [embed],
            components: [backButton],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('➕ 리마인더 추가')
        .setDescription('리마인더를 추가할 안건을 선택하세요.')
        .setFooter({ text: `총 ${topicsWithoutReminder.length}개 안건` })
        .setTimestamp();
    
    // 셀렉트 메뉴 옵션 생성 (최대 25개)
    const options = topicsWithoutReminder.slice(0, 25).map(topic => ({
        label: `#${topic.id} - ${topic.title.substring(0, 50)}`,
        description: `작성자: ${topic.created_by}`,
        value: `reminder_select_${topic.id}`
    }));
    
    const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('reminder_topic_select')
            .setPlaceholder('안건을 선택하세요')
            .addOptions(options)
    );
    
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('reminder_add_manual')
            .setLabel('번호로 입력')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔢'),
        new ButtonBuilder()
            .setCustomId('reminder_back')
            .setLabel('뒤로가기')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
    );
    
    await interaction.editReply({
        embeds: [embed],
        components: [selectMenu, buttons],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 안건별 리마인더 관리
 */
export async function handleReminderManage(interaction) {
    await interaction.deferUpdate();
    
    // 회의 시간이 설정된 안건 목록
    const topics = getTopics(interaction.guildId, '진행중');
    const topicsWithReminder = topics.filter(t => t.meeting_date);
    
    if (!topicsWithReminder || topicsWithReminder.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('📭 리마인더가 설정된 안건 없음')
            .setDescription('회의 시간이 설정된 안건이 없습니다.')
            .setTimestamp();
        
        const backButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('reminder_back')
                .setLabel('뒤로가기')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️')
        );
        
        await interaction.editReply({
            embeds: [embed],
            components: [backButton],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📝 안건별 리마인더 관리')
        .setDescription('리마인더를 관리할 안건을 선택하세요.')
        .setFooter({ text: `총 ${topicsWithReminder.length}개 안건` })
        .setTimestamp();
    
    // 각 안건의 리마인더 정보 표시
    for (const topic of topicsWithReminder.slice(0, 10)) {
        const meetingDate = new Date(topic.meeting_date);
        const reminders = await getRemindersByTopic(topic.id);
        const activeReminders = reminders.filter(r => !r.delivered_at);
        
        embed.addFields({
            name: `#${topic.id} - ${topic.title.substring(0, 50)}`,
            value: `📅 회의: ${meetingDate.toLocaleString('ko-KR')}\n🔔 활성 리마인더: ${activeReminders.length}개`,
            inline: true
        });
    }
    
    // 셀렉트 메뉴 옵션 생성
    const options = topicsWithReminder.slice(0, 25).map(topic => {
        const meetingDate = new Date(topic.meeting_date);
        return {
            label: `#${topic.id} - ${topic.title.substring(0, 50)}`,
            description: `회의: ${meetingDate.toLocaleDateString('ko-KR')}`,
            value: `reminder_manage_${topic.id}`
        };
    });
    
    const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('reminder_manage_select')
            .setPlaceholder('관리할 안건을 선택하세요')
            .addOptions(options)
    );
    
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('reminder_back')
            .setLabel('뒤로가기')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
    );
    
    await interaction.editReply({
        embeds: [embed],
        components: [selectMenu, buttons],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 리마인더 설정
 */
export async function handleReminderSettings(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚙️ 리마인더 설정')
        .setDescription('리마인더 전역 설정을 관리합니다.')
        .addFields(
            { 
                name: '📅 기본 리마인더 정책',
                value: '새 안건 생성 시 적용될 기본 리마인더 정책',
                inline: false
            },
            {
                name: '현재 정책 옵션',
                value: '• **default**: 1일 전, 1시간 전, 정시\n• **simple**: 1시간 전만\n• **all**: 모든 알림\n• **off**: 알림 없음',
                inline: false
            }
        )
        .setFooter({ text: '설정은 서버별로 저장됩니다' })
        .setTimestamp();
    
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('reminder_policy_default')
            .setLabel('기본 (Default)')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('reminder_policy_simple')
            .setLabel('간단 (Simple)')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('reminder_policy_all')
            .setLabel('전체 (All)')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('reminder_policy_off')
            .setLabel('끄기 (Off)')
            .setStyle(ButtonStyle.Danger)
    );
    
    const backButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('reminder_back')
            .setLabel('뒤로가기')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
    );
    
    await interaction.update({
        embeds: [embed],
        components: [buttons, backButton],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 특정 안건 리마인더 상세 관리
 */
export async function handleReminderDetail(interaction, topicId) {
    const topic = getTopic(topicId);
    
    if (!topic || topic.guild_id !== interaction.guildId) {
        await interaction.update({
            content: '❌ 해당 안건을 찾을 수 없습니다.',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    const reminders = await getRemindersByTopic(topicId);
    const meetingDate = topic.meeting_date ? new Date(topic.meeting_date) : null;
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🔔 안건 #${topicId} 리마인더`)
        .setDescription(`**${topic.title}**`)
        .addFields({
            name: '📅 회의 일시',
            value: meetingDate ? meetingDate.toLocaleString('ko-KR') : '설정되지 않음',
            inline: true
        })
        .setTimestamp();
    
    if (reminders && reminders.length > 0) {
        const activeReminders = reminders.filter(r => !r.delivered_at);
        const deliveredReminders = reminders.filter(r => r.delivered_at);
        
        if (activeReminders.length > 0) {
            const reminderList = activeReminders.map(r => {
                const scheduleDate = new Date(r.scheduled_at);
                const typeLabel = {
                    'before-1d': '1일 전',
                    'before-3h': '3시간 전',
                    'before-1h': '1시간 전',
                    'on-time': '정시',
                    'overdue': '연체'
                }[r.type] || r.type;
                
                return `• **${typeLabel}**: ${scheduleDate.toLocaleString('ko-KR')}`;
            }).join('\n');
            
            embed.addFields({
                name: `🔔 활성 리마인더 (${activeReminders.length}개)`,
                value: reminderList.substring(0, 1024),
                inline: false
            });
        }
        
        if (deliveredReminders.length > 0) {
            embed.addFields({
                name: `✅ 전송 완료 (${deliveredReminders.length}개)`,
                value: `이미 ${deliveredReminders.length}개의 리마인더가 전송되었습니다.`,
                inline: false
            });
        }
    } else {
        embed.addFields({
            name: '📭 리마인더 없음',
            value: '이 안건에는 설정된 리마인더가 없습니다.',
            inline: false
        });
    }
    
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`reminder_edit_${topicId}`)
            .setLabel('회의 시간 변경')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✏️')
            .setDisabled(!topic.meeting_date),
        new ButtonBuilder()
            .setCustomId(`reminder_delete_${topicId}`)
            .setLabel('리마인더 삭제')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
            .setDisabled(!reminders || reminders.length === 0),
        new ButtonBuilder()
            .setCustomId('reminder_manage')
            .setLabel('목록으로')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📋'),
        new ButtonBuilder()
            .setCustomId('reminder_back')
            .setLabel('메인으로')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🏠')
    );
    
    await interaction.update({
        embeds: [embed],
        components: [buttons],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 뒤로가기 버튼 처리
 */
export async function handleReminderBack(interaction) {
    await showReminderDashboard(interaction, false);
}

/**
 * 취소 버튼 처리
 */
export async function handleReminderCancel(interaction) {
    await interaction.update({
        content: '✅ 리마인더 관리를 종료합니다.',
        embeds: [],
        components: [],
        flags: MessageFlags.Ephemeral
    });
    
    // 세션 정리
    reminderSessions.delete(interaction.user.id);
}

/**
 * 리마인더 새로고침
 */
export async function handleReminderRefresh(interaction) {
    await handleReminderList(interaction);
}