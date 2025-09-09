import {
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from 'discord.js';
import { clearSessions, showPreview } from '../commands/clear.js';
import { deleteTopic, getTopics } from '../db/database.js';

/**
 * 다음 단계 버튼 처리
 */
export async function handleClearNext(interaction) {
    if (!interaction.customId.startsWith('clear_next:')) return;
    
    const sessionId = interaction.customId.replace('clear_next:', '');
    const session = clearSessions.get(sessionId);
    
    if (!session) {
        await interaction.update({
            content: '⏱️ 세션이 만료되었습니다. `/clear` 명령어를 다시 실행해주세요.',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    session.step = 'confirm';
    await showConfirmation(interaction, sessionId);
}

/**
 * 상세 보기 버튼 처리
 */
export async function handleClearDetails(interaction) {
    if (!interaction.customId.startsWith('clear_details:')) return;
    
    const sessionId = interaction.customId.replace('clear_details:', '');
    const session = clearSessions.get(sessionId);
    
    if (!session) {
        await interaction.reply({
            content: '⏱️ 세션이 만료되었습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    const { targets } = session;
    
    // 상세 목록 Embed
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📋 삭제 대상 상세 목록')
        .setDescription(`총 ${targets.length}개 항목`)
        .setTimestamp();
    
    // 페이지 나누기 (Embed 필드 제한 때문에)
    const itemsPerPage = 10;
    const pages = Math.ceil(targets.length / itemsPerPage);
    
    for (let page = 0; page < Math.min(pages, 2); page++) {
        const start = page * itemsPerPage;
        const end = Math.min(start + itemsPerPage, targets.length);
        const pageTargets = targets.slice(start, end);
        
        const listText = pageTargets.map((t, i) => {
            if (t.type === 'topic') {
                const emoji = getStatusEmoji(t.status);
                return `${start + i + 1}. ${emoji} #${t.id} - ${t.title.substring(0, 40)}`;
            } else {
                return `${start + i + 1}. 🧵 ${t.name.substring(0, 40)}`;
            }
        }).join('\n');
        
        embed.addFields({
            name: page === 0 ? '목록' : '목록 (계속)',
            value: listText || '없음',
            inline: false
        });
    }
    
    if (targets.length > 20) {
        embed.setFooter({ text: `... 외 ${targets.length - 20}개 더` });
    }
    
    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 확인 단계 표시
 */
async function showConfirmation(interaction, sessionId) {
    const session = clearSessions.get(sessionId);
    if (!session) return;
    
    const { scope, targets, options } = session;
    const stats = getTargetStats(targets);
    
    // 확인 Embed
    const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('⚠️ 삭제 확인')
        .setDescription('정말로 삭제하시겠습니까?\n이 작업은 **되돌릴 수 없습니다**.')
        .setTimestamp();
    
    // 삭제 요약
    const summaryLines = [];
    if (stats.topics > 0) summaryLines.push(`• 📋 **${stats.topics}**개 안건`);
    if (stats.messages > 0) summaryLines.push(`• 💬 **${stats.messages}**개 메시지`);
    if (stats.threads > 0) summaryLines.push(`• 🧵 **${stats.threads}**개 스레드`);
    
    embed.addFields({
        name: '🗑️ 삭제될 항목',
        value: summaryLines.join('\n'),
        inline: false
    });
    
    // 경고 사항
    embed.addFields({
        name: '⚠️ 주의사항',
        value: [
            '• 삭제된 데이터는 복구할 수 없습니다',
            '• 관련된 모든 메시지가 삭제됩니다',
            '• 스레드는 아카이브 및 잠금 처리됩니다',
            '• 데이터베이스 기록이 영구 삭제됩니다'
        ].join('\n'),
        inline: false
    });
    
    // 진행 단계
    const progressBar = getProgressBar(2, 3);
    embed.setFooter({ 
        text: `단계 2/3: 확인 ${progressBar} | DELETE 입력 필요` 
    });
    
    // 버튼들
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`clear_execute:${sessionId}`)
            .setLabel('삭제 실행')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
        
        new ButtonBuilder()
            .setCustomId(`clear_back:${sessionId}`)
            .setLabel('이전 단계')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️'),
        
        new ButtonBuilder()
            .setCustomId('clear_cancel')
            .setLabel('취소')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌')
    );
    
    await interaction.update({
        embeds: [embed],
        components: [buttons],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 실행 버튼 처리 (모달 표시)
 */
export async function handleClearExecute(interaction) {
    if (!interaction.customId.startsWith('clear_execute:')) return;
    
    const sessionId = interaction.customId.replace('clear_execute:', '');
    const session = clearSessions.get(sessionId);
    
    if (!session) {
        await interaction.reply({
            content: '⏱️ 세션이 만료되었습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 확인 모달
    const modal = new ModalBuilder()
        .setCustomId(`clear_modal:${sessionId}`)
        .setTitle('🗑️ 최종 삭제 확인');
    
    const confirmInput = new TextInputBuilder()
        .setCustomId('confirm_text')
        .setLabel('삭제를 확인하려면 "DELETE" 를 입력하세요')
        .setPlaceholder('DELETE')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(6)
        .setMaxLength(6);
    
    const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('삭제 사유 (선택)')
        .setPlaceholder('예: 정기 정리, 완료된 프로젝트 삭제')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(confirmInput),
        new ActionRowBuilder().addComponents(reasonInput)
    );
    
    await interaction.showModal(modal);
}

/**
 * 이전 단계 버튼 처리
 */
export async function handleClearBack(interaction) {
    if (!interaction.customId.startsWith('clear_back:')) return;
    
    const sessionId = interaction.customId.replace('clear_back:', '');
    const session = clearSessions.get(sessionId);
    
    if (!session) {
        await interaction.update({
            content: '⏱️ 세션이 만료되었습니다.',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    session.step = 'preview';
    await showPreview(interaction, sessionId);
}

/**
 * 취소 버튼 처리
 */
export async function handleClearCancel(interaction) {
    if (interaction.customId !== 'clear_cancel') return;
    
    await interaction.update({
        content: '❌ 삭제가 취소되었습니다.',
        embeds: [],
        components: [],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 안건 선택 처리
 */
export async function handleClearTopicSelect(interaction) {
    if (interaction.customId !== 'clear_topic_select') return;
    
    const selectedIds = interaction.values.map(v => parseInt(v));
    const topics = getTopics(interaction.guildId, '전체');
    const selectedTopics = topics.filter(t => selectedIds.includes(t.id));
    
    if (selectedTopics.length === 0) {
        await interaction.update({
            content: '❌ 선택한 안건을 찾을 수 없습니다.',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 세션 생성
    const sessionId = `${interaction.user.id}_${Date.now()}`;
    const targets = selectedTopics.map(t => ({ type: 'topic', ...t }));
    
    clearSessions.set(sessionId, {
        scope: 'select',
        targets,
        options: {},
        userId: interaction.user.id,
        guildId: interaction.guildId,
        step: 'preview'
    });
    
    setTimeout(() => {
        clearSessions.delete(sessionId);
    }, 10 * 60 * 1000);
    
    await showPreview(interaction, sessionId);
}

/**
 * 모달 제출 처리 (실제 삭제)
 */
export async function handleClearModal(interaction) {
    if (!interaction.customId.startsWith('clear_modal:')) return;
    
    const sessionId = interaction.customId.replace('clear_modal:', '');
    const session = clearSessions.get(sessionId);
    
    if (!session) {
        await interaction.reply({
            content: '⏱️ 세션이 만료되었습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 확인 텍스트 검증
    const confirmText = interaction.fields.getTextInputValue('confirm_text');
    if (confirmText !== 'DELETE') {
        await interaction.reply({
            content: '❌ 확인 텍스트가 일치하지 않습니다. "DELETE"를 정확히 입력해주세요.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    const reason = interaction.fields.getTextInputValue('reason') || '사유 없음';
    
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    session.step = 'execute';
    
    try {
        // 삭제 실행
        const results = await executeDeletion(interaction, session);
        
        // 결과 Embed
        const embed = new EmbedBuilder()
            .setColor(results.success ? 0x00FF00 : 0xFFA500)
            .setTitle(results.success ? '✅ 삭제 완료' : '⚠️ 부분 완료')
            .setDescription(`**삭제 사유**: ${reason}`)
            .setTimestamp();
        
        // 삭제 결과 통계
        const statsLines = [];
        if (results.deletedTopics > 0) {
            statsLines.push(`✅ 안건: ${results.deletedTopics}개 삭제됨`);
        }
        if (results.failedTopics > 0) {
            statsLines.push(`❌ 안건: ${results.failedTopics}개 실패`);
        }
        if (results.deletedMessages > 0) {
            statsLines.push(`✅ 메시지: ${results.deletedMessages}개 삭제됨`);
        }
        if (results.archivedThreads > 0) {
            statsLines.push(`🗄️ 스레드: ${results.archivedThreads}개 아카이브됨`);
        }
        
        embed.addFields({
            name: '📊 처리 결과',
            value: statsLines.join('\n') || '처리된 항목 없음',
            inline: false
        });
        
        // 성공률 표시
        const totalAttempts = results.deletedTopics + results.failedTopics;
        if (totalAttempts > 0) {
            const successRate = Math.round((results.deletedTopics / totalAttempts) * 100);
            const progressBar = getSuccessBar(successRate);
            
            embed.addFields({
                name: '📈 성공률',
                value: `${progressBar} ${successRate}%`,
                inline: false
            });
        }
        
        // 오류 정보
        if (results.errors.length > 0) {
            embed.addFields({
                name: '⚠️ 오류 내역',
                value: results.errors.slice(0, 3).map(e => `• ${e}`).join('\n'),
                inline: false
            });
        }
        
        // 진행 단계
        const progressBar = getProgressBar(3, 3);
        embed.setFooter({ 
            text: `단계 3/3: 완료 ${progressBar} | 실행자: ${interaction.user.tag}` 
        });
        
        // 로그
        console.log(`[CLEAR] User: ${interaction.user.tag}, Guild: ${session.guildId}, Scope: ${session.scope}, Success: ${results.deletedTopics}/${results.deletedTopics + results.failedTopics}, Reason: ${reason}`);
        
        // 세션 정리
        clearSessions.delete(sessionId);
        
        await interaction.editReply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        console.error('삭제 실행 중 오류:', error);
        await interaction.editReply({
            content: `❌ 삭제 중 오류가 발생했습니다: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 실제 삭제 실행
 */
async function executeDeletion(interaction, session) {
    const results = {
        success: true,
        deletedTopics: 0,
        failedTopics: 0,
        deletedMessages: 0,
        archivedThreads: 0,
        errors: []
    };
    
    const { targets } = session;
    const guild = interaction.guild;
    
    for (const target of targets) {
        try {
            if (target.type === 'topic') {
                const deleted = await deleteTopicComplete(guild, target, results);
                if (deleted) {
                    results.deletedTopics++;
                } else {
                    results.failedTopics++;
                    results.success = false;
                }
            } else if (target.type === 'thread') {
                const thread = await guild.channels.fetch(target.id).catch(() => null);
                if (thread && thread.isThread()) {
                    await thread.setArchived(true);
                    await thread.setLocked(true);
                    results.archivedThreads++;
                }
            }
        } catch (error) {
            results.failedTopics++;
            results.success = false;
            results.errors.push(`#${target.id}: ${error.message}`);
        }
    }
    
    return results;
}

/**
 * 안건 완전 삭제
 */
async function deleteTopicComplete(guild, topic, results) {
    let success = true;
    
    // 1. 메시지 삭제
    try {
        const channel = await guild.channels.fetch(topic.channel_id).catch(() => null);
        if (channel && channel.isTextBased()) {
            const message = await channel.messages.fetch(topic.message_id).catch(() => null);
            if (message) {
                await message.delete();
                results.deletedMessages++;
            }
        }
    } catch (e) {
        console.error(`메시지 삭제 실패 (#${topic.id}):`, e);
        success = false;
    }
    
    // 2. 스레드 처리
    if (topic.thread_id) {
        try {
            const thread = await guild.channels.fetch(topic.thread_id).catch(() => null);
            if (thread && thread.isThread()) {
                // 봇 메시지 삭제
                const messages = await thread.messages.fetch({ limit: 100 });
                const botMessages = messages.filter(m => m.author.bot);
                
                for (const [, msg] of botMessages) {
                    await msg.delete().catch(() => {});
                    results.deletedMessages++;
                }
                
                // 스레드 아카이브
                await thread.setArchived(true);
                await thread.setLocked(true);
                results.archivedThreads++;
            }
        } catch (e) {
            console.error(`스레드 처리 실패 (#${topic.id}):`, e);
        }
    }
    
    // 3. DB 삭제
    try {
        deleteTopic(topic.id);
    } catch (e) {
        console.error(`DB 삭제 실패 (#${topic.id}):`, e);
        success = false;
    }
    
    return success;
}

/**
 * 대상 통계
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
 * 진행 바
 */
function getProgressBar(current, total) {
    const filled = '█'.repeat(current);
    const empty = '░'.repeat(total - current);
    return filled + empty;
}

/**
 * 성공률 바
 */
function getSuccessBar(percentage) {
    const total = 10;
    const filled = Math.round(percentage / 10);
    const bar = '🟩'.repeat(filled) + '⬜'.repeat(total - filled);
    return bar;
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