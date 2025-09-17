import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder
} from 'discord.js';
import { getTopics, getTopicsByFilter, deleteTopic, getRemindersByTopic, deleteRemindersByTopic } from '../db/database.js';

// 삭제 세션 저장소
const clearSessions = new Map();

export default {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('🗑️ 관리자 전용 데이터 정리')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(option =>
            option.setName('scope')
                .setDescription('정리할 항목 선택')
                .setRequired(true)
                .addChoices(
                    { name: '⚡ 빠른 정리 (완료+취소)', value: 'quick' },
                    { name: '✅ 완료된 안건들', value: 'completed' },
                    { name: '❌ 취소된 안건들', value: 'cancelled' },
                    { name: '📅 오래된 안건들 (30일+)', value: 'old' },
                    { name: '🗄️ 아카이브된 스레드', value: 'archived' },
                    { name: '🎯 특정 안건 선택', value: 'select' },
                    { name: '🔢 안건 번호로 삭제', value: 'topic' },
                    { name: '🏃 빠른 삭제 (7일+ 전체)', value: 'fast' },
                    { name: '🔔 리마인더만 정리', value: 'reminders' }
                ))
        .addIntegerOption(option =>
            option.setName('topic_id')
                .setDescription('삭제할 안건 번호 (scope=topic일 때)'))
        .addIntegerOption(option =>
            option.setName('days')
                .setDescription('며칠 이전 데이터 (기본 30일)'))
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('최대 개수 (기본 5, 최대 25)'))
        .addBooleanOption(option =>
            option.setName('skip_confirm')
                .setDescription('확인 단계 건너뛰기 (위험)')),

    async execute(interaction) {
        // 권한 확인
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({
                content: '❌ 이 명령어는 서버 관리자만 사용할 수 있습니다.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const scope = interaction.options.getString('scope');
        const topicId = interaction.options.getInteger('topic_id');
        const days = interaction.options.getInteger('days') || 30;
        const limit = Math.min(interaction.options.getInteger('limit') || 5, 25);
        const skipConfirm = interaction.options.getBoolean('skip_confirm') || false;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // scope=select인 경우 선택 메뉴 표시
            if (scope === 'select') {
                await showTopicSelectMenu(interaction);
                return;
            }

            // 삭제 대상 조회
            const targets = await getDeleteTargets(interaction.guild, scope, {
                topicId,
                days,
                limit,
                guildId: interaction.guildId
            });

            if (!targets || targets.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle('📭 삭제할 항목 없음')
                    .setDescription(getEmptyScopeMessage(scope, { topicId, days }))
                    .setFooter({ text: '다른 조건으로 다시 시도해보세요' })
                    .setTimestamp();

                await interaction.editReply({
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // 세션 저장
            const sessionId = `${interaction.user.id}_${Date.now()}`;
            clearSessions.set(sessionId, {
                scope,
                targets,
                options: { topicId, days, limit },
                userId: interaction.user.id,
                guildId: interaction.guildId,
                step: skipConfirm ? 'execute_fast' : 'preview', // preview -> confirm -> execute
                skipConfirm
            });

            // 10분 후 세션 자동 삭제
            setTimeout(() => {
                clearSessions.delete(sessionId);
            }, 10 * 60 * 1000);

            // 빠른 삭제 모드이면 바로 실행
            if (skipConfirm) {
                await executeFastDelete(interaction, sessionId);
            } else {
                // 미리보기 표시
                await showPreview(interaction, sessionId);
            }

        } catch (error) {
            console.error('Clear 명령 처리 중 오류:', error);
            await interaction.editReply({
                content: '❌ 처리 중 오류가 발생했습니다.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};

/**
 * 미리보기 표시
 */
async function showPreview(interaction, sessionId) {
    const session = clearSessions.get(sessionId);
    if (!session) return;

    const { scope, targets, options } = session;
    const stats = getTargetStats(targets);

    // 메인 Embed
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔍 삭제 미리보기')
        .setDescription(getScopeDescription(scope, options))
        .setTimestamp();

    // 통계 표시
    const statsText = [];
    if (stats.topics > 0) statsText.push(`📋 안건 ${stats.topics}개`);
    if (stats.messages > 0) statsText.push(`💬 메시지 ${stats.messages}개`);
    if (stats.threads > 0) statsText.push(`🧵 스레드 ${stats.threads}개`);
    
    embed.addFields({
        name: '📊 삭제될 항목',
        value: statsText.join('\n') || '없음',
        inline: true
    });

    // 영향 범위
    embed.addFields({
        name: '⚡ 영향 범위',
        value: [
            '• 안건 메시지 삭제',
            '• 연결된 스레드 아카이브',
            '• 데이터베이스 기록 제거',
            '• **복구 불가능**'
        ].join('\n'),
        inline: true
    });

    // 대상 목록 (최대 5개 미리보기)
    const previewCount = Math.min(5, targets.length);
    const targetList = targets.slice(0, previewCount).map(t => {
        if (t.type === 'topic') {
            const statusEmoji = getStatusEmoji(t.status);
            const date = new Date(t.created_at * 1000).toLocaleDateString('ko-KR');
            return `${statusEmoji} **#${t.id}** - ${truncate(t.title, 30)}\n   └ 생성: ${date}`;
        } else {
            return `🧵 ${truncate(t.name, 40)}`;
        }
    }).join('\n\n');

    embed.addFields({
        name: `📝 대상 목록 (${targets.length}개 중 ${previewCount}개 표시)`,
        value: targetList || '없음',
        inline: false
    });

    // 진행 단계 표시
    const progressBar = getProgressBar(1, 3);
    embed.setFooter({ 
        text: `단계 1/3: 미리보기 ${progressBar} | 세션 10분 후 만료` 
    });

    // 버튼들
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`clear_next:${sessionId}`)
            .setLabel('다음 단계')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➡️'),
        
        new ButtonBuilder()
            .setCustomId(`clear_details:${sessionId}`)
            .setLabel('상세 보기')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📋'),
        
        new ButtonBuilder()
            .setCustomId('clear_cancel')
            .setLabel('취소')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌')
    );

    await interaction.editReply({
        embeds: [embed],
        components: [buttons],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 안건 선택 메뉴 표시
 */
async function showTopicSelectMenu(interaction) {
    // 모든 안건 조회
    const topics = getTopics(interaction.guildId, '전체')
        .filter(t => t.status !== '완료' && t.status !== '취소')
        .slice(0, 25);

    if (topics.length === 0) {
        await interaction.editReply({
            content: '📭 선택할 수 있는 안건이 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎯 삭제할 안건 선택')
        .setDescription('아래 드롭다운에서 삭제할 안건을 선택하세요.\n⚠️ 선택한 안건과 관련된 모든 데이터가 삭제됩니다.')
        .setFooter({ text: '안건을 선택하면 미리보기가 표시됩니다' });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('clear_topic_select')
        .setPlaceholder('🗑️ 삭제할 안건을 선택하세요')
        .setMinValues(1)
        .setMaxValues(Math.min(5, topics.length))
        .addOptions(
            topics.map(topic => ({
                label: `#${topic.id} - ${truncate(topic.title, 50)}`,
                value: String(topic.id),
                description: `${getStatusEmoji(topic.status)} ${topic.status} | ${new Date(topic.created_at * 1000).toLocaleDateString('ko-KR')}`,
                emoji: getStatusEmoji(topic.status)
            }))
        );

    await interaction.editReply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(selectMenu)],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 삭제 대상 조회
 */
async function getDeleteTargets(guild, scope, options) {
    const targets = [];

    switch (scope) {
        case 'quick':
            // 빠른 정리: 완료 + 취소된 안건들
            const quickCompleted = getTopicsByFilter(options.guildId, { status: '완료' })
                .sort((a, b) => a.created_at - b.created_at)
                .slice(0, Math.floor(options.limit / 2));
            const quickCancelled = getTopicsByFilter(options.guildId, { status: '취소' })
                .sort((a, b) => a.created_at - b.created_at)
                .slice(0, Math.floor(options.limit / 2));
            targets.push(
                ...quickCompleted.map(t => ({ type: 'topic', ...t })),
                ...quickCancelled.map(t => ({ type: 'topic', ...t }))
            );
            break;
            
        case 'topic':
            if (!options.topicId) return [];
            const topic = getTopics(options.guildId, '전체').find(t => t.id === options.topicId);
            if (topic) {
                targets.push({ type: 'topic', ...topic });
            }
            break;

        case 'completed':
            const completed = getTopicsByFilter(options.guildId, { status: '완료' })
                .sort((a, b) => a.created_at - b.created_at) // 오래된 것부터
                .slice(0, options.limit);
            targets.push(...completed.map(t => ({ type: 'topic', ...t })));
            break;

        case 'cancelled':
            const cancelled = getTopicsByFilter(options.guildId, { status: '취소' })
                .sort((a, b) => a.created_at - b.created_at)
                .slice(0, options.limit);
            targets.push(...cancelled.map(t => ({ type: 'topic', ...t })));
            break;

        case 'old':
            const cutoffDate = Math.floor(Date.now() / 1000) - (options.days * 24 * 60 * 60);
            const oldTopics = getTopics(options.guildId, '전체')
                .filter(t => t.created_at < cutoffDate)
                .sort((a, b) => a.created_at - b.created_at)
                .slice(0, options.limit);
            targets.push(...oldTopics.map(t => ({ type: 'topic', ...t })));
            break;

        case 'archived':
            try {
                const threads = await guild.channels.fetchActiveThreads();
                const archivedThreads = threads.threads
                    .filter(t => t.archived)
                    .first(options.limit);
                targets.push(...archivedThreads.map(t => ({ 
                    type: 'thread', 
                    id: t.id, 
                    name: t.name 
                })));
            } catch (e) {
                console.error('스레드 조회 실패:', e);
            }
            break;

        case 'fast':
            // 빠른 삭제: 7일 이상 오래된 모든 완료/취소 안건
            const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
            const fastTargets = getTopics(options.guildId, '전체')
                .filter(t => (t.status === '완료' || t.status === '취소') && t.created_at < sevenDaysAgo)
                .sort((a, b) => a.created_at - b.created_at);
            targets.push(...fastTargets.map(t => ({ type: 'topic', ...t })));
            break;

        case 'reminders':
            // 리마인더만 정리 (안건은 유지)
            const topicsWithReminders = getTopics(options.guildId, '전체')
                .filter(t => {
                    const reminders = getRemindersByTopic(t.id);
                    return reminders && reminders.length > 0;
                })
                .slice(0, options.limit);
            targets.push(...topicsWithReminders.map(t => ({ type: 'reminders_only', ...t })));
            break;
    }

    return targets;
}

/**
 * 범위 설명 생성
 */
function getScopeDescription(scope, options) {
    const descriptions = {
        'quick': '⚡ 빠른 정리 (완료 + 취소 안건)',
        'topic': `🔢 안건 #${options.topicId} 삭제`,
        'completed': '✅ 완료된 안건 정리',
        'cancelled': '❌ 취소된 안건 정리',
        'old': `📅 ${options.days}일 이상 경과한 안건 정리`,
        'archived': '🗄️ 아카이브된 스레드 정리',
        'select': '🎯 선택한 안건 삭제',
        'fast': '🏃 7일 이상된 완료/취소 안건 전체 삭제',
        'reminders': '🔔 리마인더만 삭제'
    };
    return descriptions[scope] || '삭제 작업';
}

/**
 * 빈 결과 메시지
 */
function getEmptyScopeMessage(scope, options) {
    const messages = {
        'quick': '완료되거나 취소된 안건이 없습니다.',
        'topic': `안건 #${options.topicId}을(를) 찾을 수 없습니다.`,
        'completed': '완료된 안건이 없습니다.',
        'cancelled': '취소된 안건이 없습니다.',
        'old': `${options.days}일 이상 된 안건이 없습니다.`,
        'archived': '아카이브된 스레드가 없습니다.',
        'fast': '7일 이상된 완료/취소 안건이 없습니다.',
        'reminders': '리마인더가 있는 안건이 없습니다.'
    };
    return messages[scope] || '조건에 맞는 항목이 없습니다.';
}

/**
 * 대상 통계 계산
 */
function getTargetStats(targets) {
    const stats = {
        topics: 0,
        threads: 0,
        messages: 0
    };

    for (const target of targets) {
        if (target.type === 'topic') {
            stats.topics++;
            stats.messages++;
            if (target.thread_id) stats.threads++;
        } else if (target.type === 'thread') {
            stats.threads++;
        }
    }

    return stats;
}

/**
 * 진행 바 생성
 */
function getProgressBar(current, total) {
    const filled = '█'.repeat(current);
    const empty = '░'.repeat(total - current);
    return filled + empty;
}

/**
 * 텍스트 자르기
 */
function truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * 상태 이모지
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
 * 빠른 삭제 실행 (확인 없이)
 */
async function executeFastDelete(interaction, sessionId) {
    const session = clearSessions.get(sessionId);
    if (!session) return;

    const { scope, targets, options } = session;
    const totalCount = targets.length;

    if (totalCount === 0) {
        await interaction.editReply({
            content: '📦 삭제할 항목이 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // 삭제 실행 Embed
    const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('🏃 빠른 삭제 진행 중...')
        .setDescription(`총 ${totalCount}개 항목 삭제 중...`)
        .setTimestamp();

    await interaction.editReply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });

    // 삭제 실행
    let deletedCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const target of targets) {
        try {
            if (target.type === 'topic') {
                // 메시지 삭제
                const channel = await interaction.guild.channels.fetch(target.channel_id).catch(() => null);
                if (channel) {
                    const message = await channel.messages.fetch(target.message_id).catch(() => null);
                    if (message) await message.delete().catch(() => {});
                }

                // 스레드 아카이브
                if (target.thread_id) {
                    const thread = await interaction.guild.channels.fetch(target.thread_id).catch(() => null);
                    if (thread && thread.isThread()) {
                        await thread.setArchived(true);
                        await thread.setLocked(true);
                    }
                }

                // DB 삭제
                deleteTopic(target.id);
                deletedCount++;
            } else if (target.type === 'reminders_only') {
                // 리마인더만 삭제
                if (deleteRemindersByTopic) {
                    deleteRemindersByTopic(target.id);
                }
                deletedCount++;
            }
        } catch (error) {
            failedCount++;
            errors.push(`#${target.id}: ${error.message}`);
        }
    }

    // 결과 Embed
    const resultEmbed = new EmbedBuilder()
        .setColor(failedCount === 0 ? 0x00FF00 : 0xFFA500)
        .setTitle(failedCount === 0 ? '✅ 빠른 삭제 완료' : '⚠️ 부분 완료')
        .setDescription(`${deletedCount}개 성공, ${failedCount}개 실패`)
        .addFields({
            name: '📊 처리 결과',
            value: [
                `✅ 삭제됨: ${deletedCount}개`,
                `❌ 실패: ${failedCount}개`,
                `📊 성공률: ${Math.round((deletedCount / totalCount) * 100)}%`
            ].join('\n'),
            inline: false
        })
        .setTimestamp();

    if (errors.length > 0) {
        resultEmbed.addFields({
            name: '⚠️ 오류',
            value: errors.slice(0, 5).join('\n').substring(0, 1024),
            inline: false
        });
    }

    // 세션 정리
    clearSessions.delete(sessionId);

    await interaction.editReply({
        embeds: [resultEmbed],
        flags: MessageFlags.Ephemeral
    });
}

// Export for handler
export { clearSessions, showPreview, executeFastDelete };