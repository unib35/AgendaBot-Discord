import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags 
} from 'discord.js';
import { getTopics } from '../db/database.js';
import { ensurePermissions } from '../utils/guards.js';

// 링크 세션 저장소
const linkSessions = new Map();

export default {
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('🔗 안건에 회의록 링크를 추가합니다')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('회의록 링크 (선택 시 바로 적용)')
                .setRequired(false)),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            const directUrl = interaction.options.getString('url');
            
            // 진행중/대기중 안건들 조회
            const allTopics = getTopics(interaction.guildId, '전체');
            const activeTopics = allTopics.filter(t => 
                t.status === '진행중' || t.status === '대기중' || t.status === '검토중'
            );
            
            if (activeTopics.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0x2B2D31)
                    .setTitle('📭 활성 안건 없음')
                    .setDescription('링크를 추가할 수 있는 진행 중인 안건이 없습니다.')
                    .setFooter({ text: '완료된 안건에는 링크를 추가할 수 없습니다' })
                    .setTimestamp();
                
                await interaction.editReply({
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            
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
            
            // Direct URL이 제공된 경우 빠른 선택 모드
            if (directUrl) {
                await showQuickLinkSelect(interaction, topicsWithLinks, directUrl);
            } else {
                await showLinkMenu(interaction, topicsWithLinks);
            }
            
        } catch (error) {
            console.error('링크 명령 처리 중 오류:', error);
            await interaction.editReply({
                content: '❌ 처리 중 오류가 발생했습니다.',
                flags: MessageFlags.Ephemeral
            });
        }
    },
};

/**
 * 링크 메뉴 표시
 */
async function showLinkMenu(interaction, topics) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔗 회의록 링크 추가')
        .setDescription('링크를 추가할 안건을 선택하세요.')
        .setTimestamp();
    
    // 안건 미리보기
    const preview = topics.slice(0, 5).map(t => {
        const statusEmoji = getStatusEmoji(t.status);
        const linkStatus = t.hasLink ? '🔗 링크 있음' : '📎 링크 없음';
        return `${statusEmoji} **#${t.id}** - ${t.title.substring(0, 40)}\n   └ ${linkStatus}`;
    }).join('\n\n');
    
    embed.addFields({
        name: `📋 활성 안건 (${topics.length}개)`,
        value: preview + (topics.length > 5 ? `\n\n... 외 ${topics.length - 5}개` : ''),
        inline: false
    });
    
    // 통계
    const withLink = topics.filter(t => t.hasLink).length;
    const withoutLink = topics.length - withLink;
    
    embed.addFields({
        name: '📊 링크 현황',
        value: `🔗 링크 있음: ${withLink}개\n📎 링크 없음: ${withoutLink}개`,
        inline: true
    });
    
    // Select Menu
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('link_agenda_select')
        .setPlaceholder('🎯 링크를 추가/수정할 안건 선택')
        .addOptions(
            topics.slice(0, 25).map(topic => ({
                label: `#${topic.id} - ${topic.title.substring(0, 70)}`,
                value: String(topic.id),
                description: topic.hasLink ? 
                    `🔗 기존 링크: ${topic.currentLink?.substring(0, 50) || '있음'}` : 
                    '📎 링크 없음',
                emoji: topic.hasLink ? '🔗' : '📎'
            }))
        );
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    // 빠른 입력 버튼
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('link_batch')
            .setLabel('여러 개 한번에')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📦')
            .setDisabled(topics.length === 0),
        
        new ButtonBuilder()
            .setCustomId('link_template')
            .setLabel('템플릿 사용')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📝')
    );
    
    await interaction.editReply({
        embeds: [embed],
        components: [row, buttons],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 빠른 링크 선택 (URL 미리 제공된 경우)
 */
async function showQuickLinkSelect(interaction, topics, url) {
    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('⚡ 빠른 링크 추가')
        .setDescription(`제공된 링크를 추가할 안건을 선택하세요.`)
        .addFields({
            name: '📎 추가할 링크',
            value: `\`${url.substring(0, 100)}\``,
            inline: false
        })
        .setTimestamp();
    
    // 안건 목록
    const topicList = topics.slice(0, 10).map(t => {
        const emoji = t.hasLink ? '🔗' : '📎';
        return `${emoji} **#${t.id}** - ${t.title.substring(0, 40)}`;
    }).join('\n');
    
    embed.addFields({
        name: '📋 선택 가능한 안건',
        value: topicList,
        inline: false
    });
    
    // 빠른 선택 버튼들 (상위 5개)
    const buttons = [];
    const buttonRows = [];
    
    for (let i = 0; i < Math.min(5, topics.length); i++) {
        const topic = topics[i];
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`link_quick:${topic.id}:${Date.now()}`)
                .setLabel(`#${topic.id}`)
                .setStyle(topic.hasLink ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setEmoji(topic.hasLink ? '🔗' : '📎')
        );
    }
    
    // 버튼을 한 행에 배치
    if (buttons.length > 0) {
        buttonRows.push(new ActionRowBuilder().addComponents(...buttons));
    }
    
    // 다른 옵션 버튼
    buttonRows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('link_other')
            .setLabel('다른 안건 선택')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📋'),
        
        new ButtonBuilder()
            .setCustomId('link_cancel')
            .setLabel('취소')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌')
    ));
    
    // 세션 저장
    const sessionId = `${interaction.user.id}_${Date.now()}`;
    linkSessions.set(sessionId, { topics, url });
    
    setTimeout(() => {
        linkSessions.delete(sessionId);
    }, 5 * 60 * 1000);
    
    await interaction.editReply({
        embeds: [embed],
        components: buttonRows,
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 링크 추출
 */
function extractLink(content) {
    const lines = content.split('\n');
    let linkIndex = lines.findIndex(line => line.includes('### 링크'));
    
    if (linkIndex === -1) return null;
    
    // 다음 줄의 링크 찾기
    for (let i = linkIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#')) break; // 다음 섹션
        if (line === '_미정_' || line === '') continue;
        
        // URL 패턴 찾기
        const urlMatch = line.match(/https?:\/\/[^\s]+/);
        if (urlMatch) return urlMatch[0];
        
        return line; // URL이 아니어도 반환
    }
    
    return null;
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

// Export for handler
export { linkSessions, showLinkMenu };