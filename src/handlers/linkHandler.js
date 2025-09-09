import {
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    MessageFlags
} from 'discord.js';
import { getTopic, getTopics } from '../db/database.js';
import { linkSessions } from '../commands/link.js';

/**
 * 안건 선택 처리
 */
export async function handleLinkAgendaSelect(interaction) {
    if (interaction.customId !== 'link_agenda_select') return;
    
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
    
    // 링크 입력 모달
    const modal = new ModalBuilder()
        .setCustomId(`link_modal:${topicId}`)
        .setTitle(`🔗 회의록 링크 - 안건 #${topicId}`);
    
    // 현재 링크 가져오기
    let currentLink = '';
    try {
        const channel = await interaction.guild.channels.fetch(topic.channel_id);
        if (channel && channel.isTextBased()) {
            const message = await channel.messages.fetch(topic.message_id);
            currentLink = extractLink(message.content) || '';
        }
    } catch (e) {
        // 무시
    }
    
    const linkInput = new TextInputBuilder()
        .setCustomId('link_url')
        .setLabel('회의록 링크')
        .setPlaceholder('https://example.com/meeting-notes')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(currentLink)
        .setMaxLength(500);
    
    const descInput = new TextInputBuilder()
        .setCustomId('link_desc')
        .setLabel('링크 설명 (선택)')
        .setPlaceholder('예: 2024년 1월 정기 회의')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(linkInput),
        new ActionRowBuilder().addComponents(descInput)
    );
    
    await interaction.showModal(modal);
}

/**
 * 빠른 링크 버튼 처리
 */
export async function handleLinkQuick(interaction) {
    if (!interaction.customId.startsWith('link_quick:')) return;
    
    const parts = interaction.customId.split(':');
    const topicId = parseInt(parts[1]);
    const sessionKey = Array.from(linkSessions.keys()).find(key => key.includes(interaction.user.id));
    const session = sessionKey ? linkSessions.get(sessionKey) : null;
    
    if (!session || !session.url) {
        await interaction.reply({
            content: '⏱️ 세션이 만료되었습니다. 명령어를 다시 실행해주세요.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    await interaction.deferUpdate();
    
    try {
        const topic = getTopic(topicId);
        if (!topic) throw new Error('안건을 찾을 수 없습니다');
        
        // 링크 업데이트
        await updateTopicLink(interaction.guild, topic, session.url, '');
        
        // 성공 메시지
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ 링크 추가 완료')
            .setDescription(`안건 #${topicId}에 링크가 추가되었습니다.`)
            .addFields(
                { name: '안건', value: topic.title.substring(0, 100), inline: false },
                { name: '추가된 링크', value: `[회의록 바로가기](${session.url})`, inline: false }
            )
            .setTimestamp();
        
        await interaction.editReply({
            embeds: [embed],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        
        // 세션 정리
        linkSessions.delete(sessionKey);
        
    } catch (error) {
        console.error('빠른 링크 추가 중 오류:', error);
        await interaction.editReply({
            content: `❌ 링크 추가 중 오류가 발생했습니다: ${error.message}`,
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 링크 모달 처리
 */
export async function handleLinkModal(interaction) {
    if (!interaction.customId.startsWith('link_modal:')) return;
    
    const topicId = parseInt(interaction.customId.split(':')[1]);
    const topic = getTopic(topicId);
    
    if (!topic) {
        await interaction.reply({
            content: '❌ 안건을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    const linkUrl = interaction.fields.getTextInputValue('link_url');
    const linkDesc = interaction.fields.getTextInputValue('link_desc') || '';
    
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    try {
        // 링크 업데이트
        await updateTopicLink(interaction.guild, topic, linkUrl, linkDesc);
        
        // 성공 응답
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ 링크 업데이트 완료')
            .setDescription(`안건 #${topicId}의 회의록 링크가 업데이트되었습니다.`)
            .addFields(
                { name: '안건', value: topic.title.substring(0, 100), inline: false },
                { name: '링크', value: `[${linkDesc || '회의록 바로가기'}](${linkUrl})`, inline: false }
            )
            .setTimestamp();
        
        // 스레드에도 알림
        if (topic.thread_id) {
            const thread = await interaction.guild.channels.fetch(topic.thread_id).catch(() => null);
            if (thread && thread.isThread()) {
                const notifyEmbed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('🔗 회의록 링크 추가됨')
                    .setDescription(`[회의록 바로가기](${linkUrl})`)
                    .addFields({
                        name: '추가한 사람',
                        value: `<@${interaction.user.id}>`,
                        inline: true
                    })
                    .setTimestamp();
                
                if (linkDesc) {
                    notifyEmbed.addFields({
                        name: '설명',
                        value: linkDesc,
                        inline: false
                    });
                }
                
                await thread.send({ embeds: [notifyEmbed] });
            }
        }
        
        await interaction.editReply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        console.error('링크 업데이트 중 오류:', error);
        await interaction.editReply({
            content: `❌ 링크 업데이트 중 오류가 발생했습니다: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 일괄 추가 버튼 처리
 */
export async function handleLinkBatch(interaction) {
    if (interaction.customId !== 'link_batch') return;
    
    // 일괄 입력 모달
    const modal = new ModalBuilder()
        .setCustomId('link_batch_modal')
        .setTitle('📦 여러 링크 한번에 추가');
    
    const batchInput = new TextInputBuilder()
        .setCustomId('batch_links')
        .setLabel('안건번호:링크 형식으로 입력 (한 줄에 하나씩)')
        .setPlaceholder('1:https://example.com/meeting1\n2:https://example.com/meeting2\n3:https://example.com/meeting3')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(batchInput)
    );
    
    await interaction.showModal(modal);
}

/**
 * 템플릿 버튼 처리
 */
export async function handleLinkTemplate(interaction) {
    if (interaction.customId !== 'link_template') return;
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📝 링크 템플릿')
        .setDescription('자주 사용하는 링크 형식을 선택하세요.')
        .addFields(
            {
                name: 'Google Docs',
                value: '`https://docs.google.com/document/d/[문서ID]/edit`',
                inline: false
            },
            {
                name: 'Notion',
                value: '`https://notion.so/[페이지ID]`',
                inline: false
            },
            {
                name: 'Confluence',
                value: '`https://[domain].atlassian.net/wiki/spaces/[space]/pages/[pageId]`',
                inline: false
            },
            {
                name: 'GitHub',
                value: '`https://github.com/[owner]/[repo]/issues/[number]`',
                inline: false
            }
        )
        .setFooter({ text: '템플릿을 복사하여 사용하세요' });
    
    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 일괄 모달 처리
 */
export async function handleLinkBatchModal(interaction) {
    if (interaction.customId !== 'link_batch_modal') return;
    
    const batchInput = interaction.fields.getTextInputValue('batch_links');
    const lines = batchInput.split('\n').filter(line => line.trim());
    
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const results = {
        success: [],
        failed: []
    };
    
    for (const line of lines) {
        const match = line.match(/^(\d+):(.+)$/);
        if (!match) {
            results.failed.push(`❌ 잘못된 형식: ${line}`);
            continue;
        }
        
        const topicId = parseInt(match[1]);
        const url = match[2].trim();
        
        const topic = getTopic(topicId);
        if (!topic) {
            results.failed.push(`❌ #${topicId}: 안건을 찾을 수 없음`);
            continue;
        }
        
        try {
            await updateTopicLink(interaction.guild, topic, url, '');
            results.success.push(`✅ #${topicId}: ${topic.title.substring(0, 30)}`);
        } catch (error) {
            results.failed.push(`❌ #${topicId}: ${error.message}`);
        }
    }
    
    // 결과 표시
    const embed = new EmbedBuilder()
        .setColor(results.failed.length === 0 ? 0x00FF00 : 0xFFA500)
        .setTitle('📦 일괄 링크 추가 결과')
        .setDescription(`성공: ${results.success.length}개 / 실패: ${results.failed.length}개`)
        .setTimestamp();
    
    if (results.success.length > 0) {
        embed.addFields({
            name: '✅ 성공',
            value: results.success.slice(0, 10).join('\n') + 
                   (results.success.length > 10 ? `\n... 외 ${results.success.length - 10}개` : ''),
            inline: false
        });
    }
    
    if (results.failed.length > 0) {
        embed.addFields({
            name: '❌ 실패',
            value: results.failed.slice(0, 5).join('\n') +
                   (results.failed.length > 5 ? `\n... 외 ${results.failed.length - 5}개` : ''),
            inline: false
        });
    }
    
    await interaction.editReply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 기타 버튼 처리
 */
export async function handleLinkOther(interaction) {
    if (interaction.customId !== 'link_other') return;
    
    // 전체 목록으로 이동
    const allTopics = getTopics(interaction.guildId, '전체');
    const activeTopics = allTopics.filter(t => 
        t.status === '진행중' || t.status === '대기중' || t.status === '검토중'
    );
    
    // 링크 정보 포함하여 정렬
    const topicsWithLinks = [];
    
    for (const topic of activeTopics) {
        try {
            const channel = await interaction.guild.channels.fetch(topic.channel_id);
            if (channel && channel.isTextBased()) {
                const message = await channel.messages.fetch(topic.message_id).catch(() => null);
                if (message) {
                    const hasLink = message.content.includes('### 링크') && 
                                  !message.content.includes('### 링크\n_미정_');
                    topicsWithLinks.push({
                        ...topic,
                        hasLink,
                        currentLink: extractLink(message.content)
                    });
                }
            }
        } catch (err) {
            topicsWithLinks.push({
                ...topic,
                hasLink: false,
                currentLink: null
            });
        }
    }
    
    // 링크 없는 것 우선 정렬
    topicsWithLinks.sort((a, b) => {
        if (a.hasLink !== b.hasLink) return a.hasLink ? 1 : -1;
        return b.id - a.id;
    });
    
    const { showLinkMenu } = await import('../commands/link.js');
    await showLinkMenu(interaction, topicsWithLinks);
}

/**
 * 취소 버튼 처리
 */
export async function handleLinkCancel(interaction) {
    if (interaction.customId !== 'link_cancel') return;
    
    await interaction.update({
        content: '❌ 링크 추가가 취소되었습니다.',
        embeds: [],
        components: [],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 안건 링크 업데이트
 */
async function updateTopicLink(guild, topic, url, description) {
    const channel = await guild.channels.fetch(topic.channel_id);
    if (!channel || !channel.isTextBased()) {
        throw new Error('채널을 찾을 수 없습니다');
    }
    
    const message = await channel.messages.fetch(topic.message_id);
    if (!message) {
        throw new Error('메시지를 찾을 수 없습니다');
    }
    
    let content = message.content;
    const lines = content.split('\n');
    
    // 링크 섹션 찾기
    const linkIndex = lines.findIndex(line => line.includes('### 링크'));
    
    if (linkIndex === -1) {
        // 링크 섹션이 없으면 추가
        lines.push('', '### 링크', url);
    } else {
        // 기존 링크 섹션 업데이트
        let nextSectionIndex = lines.length;
        for (let i = linkIndex + 1; i < lines.length; i++) {
            if (lines[i].startsWith('#')) {
                nextSectionIndex = i;
                break;
            }
        }
        
        // 링크 섹션 재작성
        const linkContent = description ? `[${description}](${url})` : url;
        lines.splice(linkIndex + 1, nextSectionIndex - linkIndex - 1, linkContent);
    }
    
    content = lines.join('\n');
    await message.edit({ content });
}

/**
 * 링크 추출
 */
function extractLink(content) {
    const lines = content.split('\n');
    let linkIndex = lines.findIndex(line => line.includes('### 링크'));
    
    if (linkIndex === -1) return null;
    
    for (let i = linkIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#')) break;
        if (line === '_미정_' || line === '') continue;
        
        const urlMatch = line.match(/https?:\/\/[^\s\)]+/);
        if (urlMatch) return urlMatch[0];
        
        return line;
    }
    
    return null;
}