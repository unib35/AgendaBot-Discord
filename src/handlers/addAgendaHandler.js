import {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    MessageFlags,
    UserSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder
} from 'discord.js';
import { createDateSelectMenu, createQuickDateButtons } from '../utils/dateHelper.js';
import { getPendingDate, clearPendingDate } from '../handlers/dateHandler.js';

// 임시로 선택된 담당자를 저장하는 Map
const pendingAssignees = new Map();
// 안건 등록 플로우 상태 관리
const registrationFlow = new Map();
// 임시로 선택된 회의 시간 저장
const pendingMeetingTime = new Map();
// 임시로 선택된 리마인더 정책 저장
const pendingReminderPolicy = new Map();
// 임시로 선택된 커스텀 리마인더 저장
const pendingCustomReminders = new Map();
// 임시로 선택된 알림 방식 저장
const pendingNotificationType = new Map();

// 안건 등록 시작 버튼 핸들러
export async function handleAddStart(interaction) {
    if (!interaction.customId.startsWith('add_start_')) return;
    
    const userId = interaction.customId.replace('add_start_', '');
    if (userId !== interaction.user.id) return;
    
    // 1단계: 담당자 선택
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('👥 1단계: 담당자 선택')
        .setDescription('안건 담당자를 선택해주세요.\n담당자를 지정하지 않으려면 건너뛰기를 클릭하세요.');
    
    const userSelectRow = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
            .setCustomId(`add_assignees_${interaction.user.id}`)
            .setPlaceholder('담당자를 선택하세요 (최대 5명)')
            .setMinValues(0)
            .setMaxValues(5)
    );
    
    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`add_skip_assignees_${interaction.user.id}`)
            .setLabel('건너뛰기')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏩'),
        new ButtonBuilder()
            .setCustomId(`add_to_date_${interaction.user.id}`)
            .setLabel('다음 단계')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➡️')
            .setDisabled(true) // 처음에는 비활성화
    );
    
    registrationFlow.set(interaction.user.id, { step: 1 });
    
    await interaction.update({
        embeds: [embed],
        components: [userSelectRow, buttonRow],
        flags: MessageFlags.Ephemeral
    });
}

export async function handleUserSelect(interaction) {
    if (!interaction.customId.startsWith('add_assignees_')) return;
    
    const userId = interaction.customId.replace('add_assignees_', '');
    if (userId !== interaction.user.id) return;
    
    // 선택한 유저 ID들을 저장
    pendingAssignees.set(interaction.user.id, interaction.values);
    
    const selectedText = interaction.values.length > 0 
        ? `✅ ${interaction.values.length}명의 담당자가 선택되었습니다: ${interaction.values.map(id => `<@${id}>`).join(', ')}`
        : '👤 담당자를 선택하지 않았습니다.';
    
    // 다음 버튼 활성화
    const components = interaction.message.components;
    components[1].components[1].data.disabled = false;
    
    const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setDescription(selectedText);
    
    await interaction.update({
        embeds: [embed],
        components: components,
        flags: MessageFlags.Ephemeral
    });
}

// 담당자 건너뛰기
export async function handleSkipAssignees(interaction) {
    if (!interaction.customId.startsWith('add_skip_assignees_')) return;
    
    const userId = interaction.customId.replace('add_skip_assignees_', '');
    if (userId !== interaction.user.id) return;
    
    pendingAssignees.set(interaction.user.id, []);
    
    // 2단계로 이동
    await showDateSelection(interaction);
}

// 2단계: 날짜 선택로 이동
export async function handleToDate(interaction) {
    if (!interaction.customId.startsWith('add_to_date_')) return;
    
    const userId = interaction.customId.replace('add_to_date_', '');
    if (userId !== interaction.user.id) return;
    
    await showDateSelection(interaction);
}

// 날짜 선택 화면 표시 (회의 시간 선택으로 변경)
async function showDateSelection(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📅 2단계: 회의 일시 선택')
        .setDescription('회의 일시를 선택해주세요.\n회의 시간을 설정하면 자동으로 리마인더가 생성됩니다.');
    
    // 회의 시간 입력을 위한 버튼들
    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`add_meeting_modal_${interaction.user.id}`)
            .setLabel('회의 일시 입력')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🕐'),
        new ButtonBuilder()
            .setCustomId(`add_skip_meeting_${interaction.user.id}`)
            .setLabel('건너뛰기')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏩')
    );
    
    registrationFlow.get(interaction.user.id).step = 2;
    
    await interaction.update({
        embeds: [embed],
        components: [buttonRow],
        flags: MessageFlags.Ephemeral
    });
}

// 회의 시간 모달 핸들러
export async function handleMeetingModal(interaction) {
    if (!interaction.customId.startsWith('add_meeting_modal_')) return;
    
    const userId = interaction.customId.replace('add_meeting_modal_', '');
    if (userId !== interaction.user.id) return;
    
    const modal = new ModalBuilder()
        .setCustomId(`add_meeting_time_${interaction.user.id}`)
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
        .setPlaceholder('default: 1일전,1시간전 / simple: 1시간전 / all: 모두 / off: 없음')
        .setValue('default')
        .setRequired(false)
        .setMaxLength(10);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(dateInput),
        new ActionRowBuilder().addComponents(timeInput),
        new ActionRowBuilder().addComponents(reminderInput)
    );
    
    await interaction.showModal(modal);
}

// 회의 시간 건너뛰기
export async function handleSkipMeeting(interaction) {
    if (!interaction.customId.startsWith('add_skip_meeting_')) return;

    const userId = interaction.customId.replace('add_skip_meeting_', '');
    if (userId !== interaction.user.id) return;

    pendingMeetingTime.delete(interaction.user.id);
    pendingReminderPolicy.set(interaction.user.id, 'off');

    // 4단계로 이동 (리마인더 건너뛰고 바로 상세 정보로)
    await showFinalStep(interaction);
}

// 3단계: 리마인더 선택 화면 표시
export async function showReminderSelection(interaction) {
    const meetingTime = pendingMeetingTime.get(interaction.user.id);
    if (!meetingTime) {
        // 회의 시간이 없으면 바로 4단계로
        await showFinalStep(interaction);
        return;
    }

    const date = new Date(meetingTime);
    const currentPolicy = pendingReminderPolicy.get(interaction.user.id) || 'default';
    const customReminders = pendingCustomReminders.get(interaction.user.id) || [];
    const notificationType = pendingNotificationType.get(interaction.user.id) || 'channel';

    // 프리셋 설명
    const presetDescriptions = {
        'default': '1일 전(09:00), 1시간 전, 정시',
        'simple': '1시간 전만',
        'all': '1일 전(09:00), 3시간 전, 1시간 전, 정시',
        'off': '알림 없음',
        'custom': '직접 선택'
    };

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔔 3단계: 리마인더 설정')
        .setDescription('회의 알림을 언제 받으시겠습니까?')
        .addFields(
            { name: '📅 회의 일시', value: date.toLocaleString('ko-KR'), inline: true },
            { name: '📬 현재 선택', value: presetDescriptions[currentPolicy], inline: true }
        );

    if (currentPolicy === 'custom' && customReminders.length > 0) {
        embed.addFields({
            name: '⚙️ 커스텀 설정',
            value: customReminders.join(', '),
            inline: false
        });
    }

    // 반복 설정 버튼 추가
    const recurrenceButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`add_recurrence_${interaction.user.id}`)
            .setLabel('반복 회의 설정')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔁'),
        new ButtonBuilder()
            .setCustomId(`add_recurrence_none_${interaction.user.id}`)
            .setLabel('1회성 회의')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('1️⃣')
    );

    // 프리셋 드롭다운
    const presetMenu = new StringSelectMenuBuilder()
        .setCustomId(`reminder_preset_${interaction.user.id}`)
        .setPlaceholder('리마인더 프리셋 선택')
        .addOptions([
            {
                label: '기본 (1일 전, 1시간 전, 정시)',
                description: '가장 일반적인 알림 설정',
                value: 'default',
                emoji: '⭐',
                default: currentPolicy === 'default'
            },
            {
                label: '간단 (1시간 전만)',
                description: '회의 직전에만 알림',
                value: 'simple',
                emoji: '⚡',
                default: currentPolicy === 'simple'
            },
            {
                label: '전체 (1일 전, 3시간 전, 1시간 전, 정시)',
                description: '모든 시점에 알림',
                value: 'all',
                emoji: '📢',
                default: currentPolicy === 'all'
            },
            {
                label: '알림 없음',
                description: '리마인더를 생성하지 않음',
                value: 'off',
                emoji: '🔕',
                default: currentPolicy === 'off'
            },
            {
                label: '커스텀 설정',
                description: '원하는 시간을 직접 선택',
                value: 'custom',
                emoji: '🛠️',
                default: currentPolicy === 'custom'
            }
        ]);

    const components = [
        recurrenceButtons,
        new ActionRowBuilder().addComponents(presetMenu)
    ];

    // 커스텀 선택시 토글 버튼들
    if (currentPolicy === 'custom') {
        const customButtons1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`reminder_toggle_1d_${interaction.user.id}`)
                .setLabel('1일 전 (09:00)')
                .setStyle(customReminders.includes('1d') ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('📅'),
            new ButtonBuilder()
                .setCustomId(`reminder_toggle_3h_${interaction.user.id}`)
                .setLabel('3시간 전')
                .setStyle(customReminders.includes('3h') ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('⏰'),
            new ButtonBuilder()
                .setCustomId(`reminder_toggle_1h_${interaction.user.id}`)
                .setLabel('1시간 전')
                .setStyle(customReminders.includes('1h') ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('⏱️')
        );

        const customButtons2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`reminder_toggle_0h_${interaction.user.id}`)
                .setLabel('정시')
                .setStyle(customReminders.includes('0h') ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('🔔'),
            new ButtonBuilder()
                .setCustomId(`reminder_custom_time_${interaction.user.id}`)
                .setLabel('원하는 시간 설정')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⏲️')
        );

        components.push(customButtons1, customButtons2);

        // 추가 커스텀 시간이 설정되어 있으면 표시
        const additionalTimes = customReminders.filter(r => !['1d', '3h', '1h', '0h'].includes(r));
        if (additionalTimes.length > 0) {
            embed.addFields({
                name: '🕐 추가 설정 시간',
                value: additionalTimes.map(time => {
                    const [num, unit] = time.match(/(\d+)([mhd])/).slice(1);
                    const unitText = { m: '분', h: '시간', d: '일' }[unit];
                    return `${num}${unitText} 전`;
                }).join(', '),
                inline: false
            });
        }
    }

    // 알림 방식 선택 버튼
    const notificationButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`notification_channel_${interaction.user.id}`)
            .setLabel('채널 알림')
            .setStyle(notificationType === 'channel' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setEmoji('📢'),
        new ButtonBuilder()
            .setCustomId(`notification_dm_${interaction.user.id}`)
            .setLabel('DM 알림')
            .setStyle(notificationType === 'dm' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setEmoji('✉️'),
        new ButtonBuilder()
            .setCustomId(`reminder_preview_${interaction.user.id}`)
            .setLabel('미리보기')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('👁️'),
        new ButtonBuilder()
            .setCustomId(`add_reminder_continue_${interaction.user.id}`)
            .setLabel('다음 단계')
            .setStyle(ButtonStyle.Success)
            .setEmoji('➡️')
    );

    components.push(notificationButtons);

    registrationFlow.get(interaction.user.id).step = 3;

    await interaction.update({
        embeds: [embed],
        components: components,
        flags: MessageFlags.Ephemeral
    });
}

// 리마인더 프리셋 선택 핸들러
export async function handleReminderPreset(interaction) {
    if (!interaction.customId.startsWith('reminder_preset_')) return;

    const userId = interaction.customId.replace('reminder_preset_', '');
    if (userId !== interaction.user.id) return;

    const selectedPolicy = interaction.values[0];
    pendingReminderPolicy.set(interaction.user.id, selectedPolicy);

    // custom 선택시 기본값 설정
    if (selectedPolicy === 'custom' && !pendingCustomReminders.has(interaction.user.id)) {
        pendingCustomReminders.set(interaction.user.id, ['1d', '1h']);
    }

    // 화면 업데이트
    await showReminderSelection(interaction);
}

// 커스텀 리마인더 토글 핸들러
export async function handleReminderToggle(interaction) {
    const match = interaction.customId.match(/^reminder_toggle_(.+)_(.+)$/);
    if (!match) return;

    const [, timeType, userId] = match;
    if (userId !== interaction.user.id) return;

    const customReminders = pendingCustomReminders.get(interaction.user.id) || [];
    const index = customReminders.indexOf(timeType);

    if (index > -1) {
        customReminders.splice(index, 1);
    } else {
        customReminders.push(timeType);
    }

    pendingCustomReminders.set(interaction.user.id, customReminders);
    await showReminderSelection(interaction);
}

// 알림 방식 선택 핸들러
export async function handleNotificationType(interaction) {
    const match = interaction.customId.match(/^notification_(.+)_(.+)$/);
    if (!match) return;

    const [, type, userId] = match;
    if (userId !== interaction.user.id) return;

    pendingNotificationType.set(interaction.user.id, type);
    await showReminderSelection(interaction);
}

// 커스텀 시간 입력 버튼 핸들러
export async function handleCustomTimeButton(interaction) {
    if (!interaction.customId.startsWith('reminder_custom_time_')) return;

    const userId = interaction.customId.replace('reminder_custom_time_', '');
    if (userId !== interaction.user.id) return;

    const modal = new ModalBuilder()
        .setCustomId(`reminder_custom_modal_${interaction.user.id}`)
        .setTitle('⏲️ 커스텀 리마인더 시간 설정');

    const timeInput = new TextInputBuilder()
        .setCustomId('customTime')
        .setLabel('알림 시간 (숫자만 입력)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('예: 30, 45, 90')
        .setRequired(true)
        .setMaxLength(4);

    const unitInput = new TextInputBuilder()
        .setCustomId('customUnit')
        .setLabel('단위 선택 (m: 분, h: 시간, d: 일)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('m, h 또는 d 중 입력')
        .setValue('m')
        .setRequired(true)
        .setMaxLength(1);

    modal.addComponents(
        new ActionRowBuilder().addComponents(timeInput),
        new ActionRowBuilder().addComponents(unitInput)
    );

    await interaction.showModal(modal);
}

// 커스텀 시간 모달 처리
export async function handleCustomTimeModal(interaction) {
    if (!interaction.customId.startsWith('reminder_custom_modal_')) return;

    const userId = interaction.customId.replace('reminder_custom_modal_', '');
    if (userId !== interaction.user.id) return;

    const time = interaction.fields.getTextInputValue('customTime');
    const unit = interaction.fields.getTextInputValue('customUnit').toLowerCase();

    // 입력값 검증
    const timeNum = parseInt(time);
    if (isNaN(timeNum) || timeNum <= 0) {
        await interaction.reply({
            content: '❌ 올바른 숫자를 입력해주세요.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    if (!['m', 'h', 'd'].includes(unit)) {
        await interaction.reply({
            content: '❌ 단위는 m(분), h(시간), d(일) 중 하나를 입력해주세요.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // 제한 검증 (최대 7일)
    const maxMinutes = {
        m: timeNum,
        h: timeNum * 60,
        d: timeNum * 1440
    }[unit];

    if (maxMinutes > 10080) { // 7일 = 10080분
        await interaction.reply({
            content: '❌ 최대 7일 전까지만 설정 가능합니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // 커스텀 리마인더 추가
    const customReminders = pendingCustomReminders.get(interaction.user.id) || [];
    const newReminder = `${timeNum}${unit}`;

    if (!customReminders.includes(newReminder)) {
        customReminders.push(newReminder);
        pendingCustomReminders.set(interaction.user.id, customReminders);
    }

    // 화면 업데이트
    await showReminderSelection(interaction);
}

// 리마인더 미리보기
export async function handleReminderPreview(interaction) {
    if (!interaction.customId.startsWith('reminder_preview_')) return;

    const userId = interaction.customId.replace('reminder_preview_', '');
    if (userId !== interaction.user.id) return;

    const meetingTime = pendingMeetingTime.get(interaction.user.id);
    if (!meetingTime) {
        await interaction.reply({
            content: '❌ 회의 시간이 설정되지 않았습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const policy = pendingReminderPolicy.get(interaction.user.id) || 'default';
    const customReminders = pendingCustomReminders.get(interaction.user.id) || [];
    const notificationType = pendingNotificationType.get(interaction.user.id) || 'channel';

    // 리마인더 시간 계산
    const { calculateReminderTime } = await import('../services/reminderService.js');
    const { formatReminderTime } = await import('../utils/timeUtils.js');

    let reminderTypes = [];

    if (policy === 'custom') {
        customReminders.forEach(reminder => {
            if (reminder === '1d') reminderTypes.push('before-1d');
            else if (reminder === '3h') reminderTypes.push('before-3h');
            else if (reminder === '1h') reminderTypes.push('before-1h');
            else if (reminder === '0h') reminderTypes.push('on-time');
            else if (reminder.match(/^\d+[mhd]$/)) {
                reminderTypes.push(reminder);
            }
        });
    } else {
        switch(policy) {
            case 'default':
                reminderTypes = ['before-1d', 'before-1h', 'on-time'];
                break;
            case 'simple':
                reminderTypes = ['before-1h'];
                break;
            case 'all':
                reminderTypes = ['before-1d', 'before-3h', 'before-1h', 'on-time'];
                break;
            case 'off':
                reminderTypes = [];
                break;
        }
    }

    // 리마인더 시간 목록 생성
    const reminderList = reminderTypes.map(type => {
        const scheduledAt = calculateReminderTime(meetingTime, type);
        const date = new Date(scheduledAt);
        const relativeTime = formatReminderTime(scheduledAt);

        return `• **${date.toLocaleString('ko-KR')}**\n  └ ${relativeTime}`;
    });

    const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('📋 리마인더 예정 시간')
        .setDescription(`다음 시간에 알림이 전송될 예정입니다:`)
        .addFields(
            {
                name: '📅 회의 시간',
                value: new Date(meetingTime).toLocaleString('ko-KR'),
                inline: false
            },
            {
                name: '🔔 알림 방식',
                value: notificationType === 'dm' ? 'DM 알림' : '채널 알림',
                inline: true
            },
            {
                name: '📬 알림 개수',
                value: `${reminderTypes.length}개`,
                inline: true
            }
        );

    if (reminderList.length > 0) {
        embed.addFields({
            name: '⏰ 알림 시간',
            value: reminderList.join('\n\n'),
            inline: false
        });
    } else {
        embed.addFields({
            name: '⚠️ 알림 없음',
            value: '설정된 리마인더가 없습니다.',
            inline: false
        });
    }

    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}

// 리마인더 설정 완료 후 다음 단계로
export async function handleReminderContinue(interaction) {
    if (!interaction.customId.startsWith('add_reminder_continue_')) return;

    const userId = interaction.customId.replace('add_reminder_continue_', '');
    if (userId !== interaction.user.id) return;

    await showFinalStep(interaction);
}

// 4단계 화면 표시 (기존 3단계)
async function showFinalStep(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📝 3단계: 안건 상세 정보')
        .setDescription('안건의 상세 정보를 입력하세요.');
    
    const meetingTime = pendingMeetingTime.get(interaction.user.id);
    if (meetingTime) {
        const date = new Date(meetingTime);
        embed.addFields({
            name: '📅 회의 일시',
            value: date.toLocaleString('ko-KR'),
            inline: true
        });
    }
    
    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`add_final_${interaction.user.id}`)
            .setLabel('상세 정보 입력')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝')
    );
    
    registrationFlow.get(interaction.user.id).step = 3;
    
    await interaction.update({
        embeds: [embed],
        components: [buttonRow],
        flags: MessageFlags.Ephemeral
    });
}

// 4단계: 상세 정보 입력 (모달 열기)
export async function handleAddFinal(interaction) {
    if (!interaction.customId.startsWith('add_final_')) return;

    const userId = interaction.customId.replace('add_final_', '');
    if (userId !== interaction.user.id) return;

    // 저장된 정보들을 가져옴
    const assigneeIds = pendingAssignees.get(interaction.user.id) || [];
    const meetingTime = pendingMeetingTime.get(interaction.user.id);
    const reminderPolicy = pendingReminderPolicy.get(interaction.user.id) || 'default';

    // 커스텀 옵션이 있으면 modalHandler로 전달
    if (reminderPolicy === 'custom') {
        const { setPendingCustomOptions } = await import('./modalHandler.js');
        setPendingCustomOptions(interaction.user.id, {
            reminders: pendingCustomReminders.get(interaction.user.id) || [],
            notification: pendingNotificationType.get(interaction.user.id) || 'channel'
        });
    }

    // 모달 생성 (customId에 정보 인코딩)
    const encodedData = [
        assigneeIds.join(','),
        meetingTime || '',
        reminderPolicy
    ].join('|');
    
    const modal = new ModalBuilder()
        .setCustomId(`addAgendaModal:${encodedData}`)
        .setTitle('📝 3단계: 안건 상세 정보');
    
    // 제목 입력 필드
    const titleInput = new TextInputBuilder()
        .setCustomId('agendaTitle')
        .setLabel('안건 제목')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('예: 2024년 1분기 기획 회의')
        .setRequired(true)
        .setMaxLength(100);
    
    // 배경 입력 필드
    const backgroundInput = new TextInputBuilder()
        .setCustomId('agendaBackground')
        .setLabel('배경')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('이 안건을 제안하게 된 배경을 설명해주세요')
        .setRequired(true)
        .setMaxLength(500);
    
    // 목표 입력 필드
    const goalInput = new TextInputBuilder()
        .setCustomId('agendaGoal')
        .setLabel('목표')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('이 안건을 통해 달성하고자 하는 목표를 작성해주세요')
        .setRequired(true)
        .setMaxLength(500);
    
    // 마감일 입력 필드
    const deadlineInput = new TextInputBuilder()
        .setCustomId('agendaDeadline')
        .setLabel('마감일 (선택사항)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('예: 2025-01-31 또는 미정')
        .setRequired(false)
        .setMaxLength(20);

    // 추가 메모 필드
    const notesInput = new TextInputBuilder()
        .setCustomId('agendaNotes')
        .setLabel('추가 메모 (선택사항)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('추가로 기록할 내용이 있다면 작성해주세요')
        .setRequired(false)
        .setMaxLength(300);

    // Action Rows에 입력 필드 추가
    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(backgroundInput),
        new ActionRowBuilder().addComponents(goalInput),
        new ActionRowBuilder().addComponents(deadlineInput),
        new ActionRowBuilder().addComponents(notesInput)
    );
    
    await interaction.showModal(modal);
}

// 기존 handleAddNext는 더 이상 사용하지 않음 (deprecated)
export async function handleAddNext(interaction) {
    if (!interaction.customId.startsWith('add_next_')) return;
    
    const userId = interaction.customId.replace('add_next_', '');
    if (userId !== interaction.user.id) return;
    
    // 저장된 담당자 ID들을 가져옴
    const assigneeIds = pendingAssignees.get(interaction.user.id) || [];
    
    // 모달 생성 (customId에 담당자 ID 인코딩)
    const modal = new ModalBuilder()
        .setCustomId(`addAgendaModal:${assigneeIds.join(',')}`)
        .setTitle('📝 안건 등록 (2/2)');
    
    // 제목 입력 필드
    const titleInput = new TextInputBuilder()
        .setCustomId('agendaTitle')
        .setLabel('안건 제목')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('예: 2024년 1분기 기획 회의')
        .setRequired(true)
        .setMaxLength(100);
    
    // 배경 입력 필드
    const backgroundInput = new TextInputBuilder()
        .setCustomId('agendaBackground')
        .setLabel('배경')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('이 안건을 제안하게 된 배경을 설명해주세요')
        .setRequired(true)
        .setMaxLength(500);
    
    // 목표 입력 필드
    const goalInput = new TextInputBuilder()
        .setCustomId('agendaGoal')
        .setLabel('목표')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('이 안건을 통해 달성하고자 하는 목표를 작성해주세요')
        .setRequired(true)
        .setMaxLength(500);
    
    // 마감일은 이미 선택되었으므로 자동으로 채워짐
    const selectedDate = getPendingDate(interaction.user.id);
    const deadlineInput = new TextInputBuilder()
        .setCustomId('agendaDeadline')
        .setLabel('마감일')
        .setStyle(TextInputStyle.Short)
        .setValue(selectedDate || '') // 선택된 날짜 자동 입력
        .setRequired(false)
        .setMaxLength(20);
    
    // 추가 메모 필드 (담당자 대신)
    const notesInput = new TextInputBuilder()
        .setCustomId('agendaNotes')
        .setLabel('추가 메모 (선택사항)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('추가로 기록할 내용이 있다면 작성해주세요')
        .setRequired(false)
        .setMaxLength(300);
    
    // Action Rows에 입력 필드 추가
    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(backgroundInput),
        new ActionRowBuilder().addComponents(goalInput),
        new ActionRowBuilder().addComponents(deadlineInput),
        new ActionRowBuilder().addComponents(notesInput)
    );
    
    await interaction.showModal(modal);
}

export function getPendingAssignees(userId) {
    return pendingAssignees.get(userId) || [];
}

export function clearPendingAssignees(userId) {
    pendingAssignees.delete(userId);
}

export function getPendingMeetingTime(userId) {
    return pendingMeetingTime.get(userId);
}

export function setPendingMeetingTime(userId, time) {
    pendingMeetingTime.set(userId, time);
}

export function clearPendingMeetingTime(userId) {
    pendingMeetingTime.delete(userId);
}

export function getPendingReminderPolicy(userId) {
    return pendingReminderPolicy.get(userId) || 'default';
}

export function setPendingReminderPolicy(userId, policy) {
    pendingReminderPolicy.set(userId, policy);
}

export function clearPendingReminderPolicy(userId) {
    pendingReminderPolicy.delete(userId);
}

// 모든 임시 데이터 클리어
export function clearAllPending(userId) {
    pendingAssignees.delete(userId);
    pendingMeetingTime.delete(userId);
    pendingReminderPolicy.delete(userId);
    pendingCustomReminders.delete(userId);
    pendingNotificationType.delete(userId);
    registrationFlow.delete(userId);
}