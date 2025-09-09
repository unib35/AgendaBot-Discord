import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    MessageFlags
} from 'discord.js';
import { 
    getTopics, 
    getTopic,
    getGuildSettings 
} from '../db/database.js';
import { ensurePermissions } from '../utils/guards.js';

// 세션 저장소
export const editSessions = new Map();

export default {
    data: new SlashCommandBuilder()
        .setName('edit')
        .setDescription('✏️ 안건 수정 - 제목, 내용, 체크리스트 등을 편집'),

    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        // 활성 안건 가져오기
        const allTopics = getTopics(interaction.guildId, '전체');
        const activeTopics = allTopics.filter(t => 
            t.status === '진행중' || t.status === '대기중' || t.status === '검토중'
        );
        
        if (activeTopics.length === 0) {
            await interaction.editReply({
                content: '❌ 수정할 수 있는 안건이 없습니다.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        // 안건 선택 메뉴 표시
        await showEditMenu(interaction, activeTopics);
    }
};

/**
 * 수정 메뉴 표시
 */
export async function showEditMenu(interaction, topics) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('✏️ 안건 수정')
        .setDescription('수정할 안건을 선택하세요.')
        .setTimestamp();
    
    // 안건 정보 표시
    const displayTopics = topics.slice(0, 5);
    for (const topic of displayTopics) {
        embed.addFields({
            name: `#${topic.id} - ${topic.title.substring(0, 50)}`,
            value: `상태: ${topic.status} | 생성자: <@${topic.created_by}>`,
            inline: false
        });
    }
    
    // 드롭다운 메뉴
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('edit_topic_select')
        .setPlaceholder('🎯 수정할 안건 선택')
        .addOptions(
            topics.slice(0, 25).map(topic => ({
                label: `#${topic.id} - ${topic.title.substring(0, 50)}`,
                description: `상태: ${topic.status}`,
                value: topic.id.toString(),
                emoji: getStatusEmoji(topic.status)
            }))
        );
    
    const components = [
        new ActionRowBuilder().addComponents(selectMenu)
    ];
    
    // 취소 버튼
    const cancelButton = new ButtonBuilder()
        .setCustomId('edit_cancel')
        .setLabel('취소')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Secondary);
    
    components.push(
        new ActionRowBuilder().addComponents(cancelButton)
    );
    
    await interaction.editReply({
        embeds: [embed],
        components: components,
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 수정 옵션 표시
 */
export async function showEditOptions(interaction, topicId) {
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
    
    // 세션에 선택된 안건 저장
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    editSessions.set(sessionKey, { topicId });
    
    // 현재 내용 가져오기
    let currentContent = null;
    try {
        const channel = await interaction.guild.channels.fetch(topic.channel_id);
        if (channel && channel.isTextBased()) {
            const message = await channel.messages.fetch(topic.message_id);
            if (message) {
                currentContent = message.content;
            }
        }
    } catch (error) {
        console.error('메시지 가져오기 실패:', error);
    }
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`✏️ 안건 #${topicId} 수정`)
        .setDescription(`**${topic.title}**\n\n수정할 항목을 선택하세요.`)
        .addFields(
            { name: '상태', value: topic.status, inline: true },
            { name: '생성자', value: `<@${topic.created_by}>`, inline: true }
        )
        .setTimestamp();
    
    // 수정 옵션 버튼들
    const buttons = [
        new ButtonBuilder()
            .setCustomId(`edit_title:${topicId}`)
            .setLabel('제목 수정')
            .setEmoji('📝')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`edit_body:${topicId}`)
            .setLabel('내용 수정')
            .setEmoji('📄')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`edit_checklist:${topicId}`)
            .setLabel('체크리스트 수정')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`edit_assignees:${topicId}`)
            .setLabel('담당자 수정')
            .setEmoji('👥')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`edit_date:${topicId}`)
            .setLabel('날짜 수정')
            .setEmoji('📅')
            .setStyle(ButtonStyle.Primary)
    ];
    
    const components = [];
    
    // 버튼 5개씩 나누어 배치
    for (let i = 0; i < buttons.length; i += 5) {
        components.push(
            new ActionRowBuilder().addComponents(
                buttons.slice(i, i + 5)
            )
        );
    }
    
    // 뒤로가기 버튼
    const backButton = new ButtonBuilder()
        .setCustomId('edit_back')
        .setLabel('뒤로')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary);
    
    const cancelButton = new ButtonBuilder()
        .setCustomId('edit_cancel')
        .setLabel('취소')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger);
    
    components.push(
        new ActionRowBuilder().addComponents(backButton, cancelButton)
    );
    
    await interaction.update({
        embeds: [embed],
        components: components,
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 안건 내용 업데이트
 */
export async function updateTopicMessage(guild, topic, updates) {
    try {
        const channel = await guild.channels.fetch(topic.channel_id);
        if (!channel || !channel.isTextBased()) {
            throw new Error('채널을 찾을 수 없습니다.');
        }
        
        const message = await channel.messages.fetch(topic.message_id);
        if (!message) {
            throw new Error('메시지를 찾을 수 없습니다.');
        }
        
        let content = message.content;
        const lines = content.split('\n');
        
        // 제목 업데이트
        if (updates.title !== undefined) {
            const titleIndex = lines.findIndex(line => line.startsWith('## 📌'));
            if (titleIndex !== -1) {
                lines[titleIndex] = `## 📌 [#${topic.id}] ${updates.title}`;
            }
            
            // 스레드 제목도 업데이트
            if (topic.thread_id) {
                const thread = await guild.channels.fetch(topic.thread_id).catch(() => null);
                if (thread && thread.isThread()) {
                    const statusMatch = thread.name.match(/^\[(.*?)\]/);
                    const currentStatus = statusMatch ? statusMatch[1] : '진행중';
                    await thread.setName(`[${currentStatus}] ${updates.title}`.substring(0, 100));
                }
            }
        }
        
        // 내용 업데이트
        if (updates.body !== undefined) {
            // 제목 다음 줄부터 다음 섹션(###)까지가 본문
            const titleIndex = lines.findIndex(line => line.startsWith('## 📌'));
            let bodyStart = titleIndex + 2; // 제목 다음 빈 줄 건너뛰기
            let bodyEnd = lines.findIndex((line, idx) => idx > bodyStart && line.startsWith('###'));
            
            if (bodyEnd === -1) bodyEnd = lines.length;
            
            // 본문 교체
            lines.splice(bodyStart, bodyEnd - bodyStart, updates.body, '');
        }
        
        // 체크리스트 업데이트
        if (updates.checklist !== undefined) {
            // 진행률 섹션 제거
            const progressIndex = lines.findIndex(line => line.startsWith('**진행률**'));
            if (progressIndex !== -1) {
                lines.splice(progressIndex, 1);
                // 진행률 뒤의 빈 줄도 제거
                if (lines[progressIndex] === '') {
                    lines.splice(progressIndex, 1);
                }
            }
            
            const checklistIndex = lines.findIndex(line => line.includes('### 체크리스트'));
            
            if (checklistIndex !== -1) {
                // 기존 체크리스트 섹션 찾기
                let checklistEnd = lines.length;
                for (let i = checklistIndex + 1; i < lines.length; i++) {
                    if (lines[i].startsWith('###')) {
                        checklistEnd = i;
                        break;
                    }
                }
                
                // 체크리스트 교체
                const checklistContent = updates.checklist.length > 0 
                    ? updates.checklist.map(item => `⬜ ${item}`).join('\n')
                    : '_없음_';
                
                lines.splice(checklistIndex + 1, checklistEnd - checklistIndex - 1, checklistContent, '');
            } else if (updates.checklist.length > 0) {
                // 체크리스트 섹션 추가
                const dateIndex = lines.findIndex(line => line.includes('### 생성일'));
                if (dateIndex !== -1) {
                    const checklistContent = ['### 체크리스트']
                        .concat(updates.checklist.map(item => `⬜ ${item}`))
                        .concat(['']);
                    lines.splice(dateIndex, 0, ...checklistContent);
                }
            }
            
            // 체크리스트가 있으면 진행률 다시 계산 및 추가
            if (updates.checklist.length > 0) {
                const checklistIndex = lines.findIndex(line => line.includes('### 체크리스트'));
                if (checklistIndex !== -1) {
                    const progressText = `**진행률**: 0/${updates.checklist.length} (0%)`;
                    lines.splice(checklistIndex, 0, progressText, '');
                }
            }
        }
        
        // 담당자 업데이트
        if (updates.assignees !== undefined) {
            const assigneeIndex = lines.findIndex(line => line.includes('### 담당자'));
            if (assigneeIndex !== -1) {
                const assigneeContent = updates.assignees.length > 0
                    ? updates.assignees.map(id => `<@${id}>`).join(', ')
                    : '_미정_';
                lines[assigneeIndex + 1] = assigneeContent;
            }
        }
        
        // 날짜 업데이트
        if (updates.date !== undefined) {
            const dateIndex = lines.findIndex(line => line.includes('### 생성일'));
            if (dateIndex !== -1) {
                lines[dateIndex] = '### 날짜';
                lines[dateIndex + 1] = updates.date;
            }
        }
        
        content = lines.join('\n');
        await message.edit({ content });
        
        return true;
    } catch (error) {
        console.error('메시지 업데이트 실패:', error);
        throw error;
    }
}

/**
 * 상태 이모지 가져오기
 */
function getStatusEmoji(status) {
    const statusEmojis = {
        '진행중': '🔄',
        '대기중': '⏸️',
        '검토중': '🔍',
        '완료': '✅',
        '취소': '❌'
    };
    return statusEmojis[status] || '📋';
}