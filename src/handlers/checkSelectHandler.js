import { 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    MessageFlags
} from 'discord.js';
import { getTopic } from '../db/database.js';

// Import session storage from check2 command
let checklistSessions = null;

export function setChecklistSessions(sessions) {
    checklistSessions = sessions;
}

// 체크리스트 세션 저장소 (로컬)
const localChecklistSessions = new Map();

/**
 * 안건 선택 후 체크리스트 패널 표시
 */
export async function handleCheckAgendaSelect(interaction) {
    if (interaction.customId !== 'check_agenda_select') return;
    
    const topicId = parseInt(interaction.values[0]);
    const topic = getTopic(topicId);
    
    if (!topic) {
        await interaction.reply({
            content: '❌ 안건을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    try {
        // 원본 메시지 가져오기
        const channel = await interaction.guild.channels.fetch(topic.channel_id);
        const message = await channel.messages.fetch(topic.message_id);
        const content = message.content;
        
        // 체크리스트 파싱
        const checklistItems = parseChecklist(content);
        
        if (checklistItems.length === 0) {
            await interaction.update({
                content: '⚠️ 이 안건에는 체크리스트가 없습니다.',
                embeds: [],
                components: [],
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        // 진행률 계산
        const completed = checklistItems.filter(item => item.checked).length;
        const total = checklistItems.length;
        const percentage = Math.round((completed / total) * 100);
        
        // 진행률 바 생성
        const barLength = 20;
        const filledLength = Math.round((percentage / 100) * barLength);
        const progressBar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
        
        // Embed 생성
        const embed = new EmbedBuilder()
            .setColor(percentage === 100 ? 0x00FF00 : 0x5865F2)
            .setTitle(`📋 체크리스트 관리 - 안건 #${topicId}`)
            .setDescription(`**${topic.title}**\n\n\`${progressBar}\` **${percentage}%**`)
            .addFields(
                { name: '완료', value: `${completed}개`, inline: true },
                { name: '전체', value: `${total}개`, inline: true },
                { name: '남은 항목', value: `${total - completed}개`, inline: true }
            );
        
        // 체크리스트 미리보기 (최대 10개)
        const preview = checklistItems.slice(0, 10).map((item, i) => 
            `${item.checked ? '✅' : '⬜'} ${i + 1}. ${item.text}`
        ).join('\n');
        
        if (checklistItems.length > 10) {
            embed.addFields({
                name: '체크리스트 미리보기',
                value: preview + `\n... 외 ${checklistItems.length - 10}개`,
                inline: false
            });
        } else {
            embed.addFields({
                name: '체크리스트',
                value: preview,
                inline: false
            });
        }
        
        // 세션 ID 생성 및 저장
        const sessionId = `${interaction.user.id}_${Date.now()}`;
        localChecklistSessions.set(sessionId, {
            topicId,
            messageId: topic.message_id,
            channelId: topic.channel_id,
            items: checklistItems,
            selectedIndexes: []
        });
        
        // Select Menu 생성 (최대 25개)
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`check_select:${sessionId}`)
            .setPlaceholder('✅ 토글할 항목을 선택하세요 (다중 선택 가능)')
            .setMinValues(0)
            .setMaxValues(Math.min(checklistItems.length, 10))
            .addOptions(
                checklistItems.slice(0, 25).map((item, index) => ({
                    label: `${index + 1}. ${item.text.substring(0, 80)}`,
                    value: String(index),
                    description: item.checked ? '✅ 완료됨' : '⬜ 미완료',
                    emoji: item.checked ? '✅' : '⬜'
                }))
            );
        
        // 액션 버튼들
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`check_toggle:${sessionId}`)
                .setLabel('선택 항목 토글')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔄')
                .setDisabled(true), // 처음에는 비활성화
            
            new ButtonBuilder()
                .setCustomId(`check_all:${sessionId}`)
                .setLabel('모두 완료')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            
            new ButtonBuilder()
                .setCustomId(`check_none:${sessionId}`)
                .setLabel('모두 해제')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬜')
        );
        
        await interaction.update({
            embeds: [embed],
            components: [
                new ActionRowBuilder().addComponents(selectMenu),
                buttons
            ],
            flags: MessageFlags.Ephemeral
        });
        
        // 5분 후 세션 자동 정리
        setTimeout(() => {
            localChecklistSessions.delete(sessionId);
        }, 5 * 60 * 1000);
        
    } catch (error) {
        console.error('체크리스트 패널 표시 중 오류:', error);
        await interaction.update({
            content: '❌ 체크리스트를 불러오는 중 오류가 발생했습니다.',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 체크리스트 선택 메뉴 처리
 */
export async function handleCheckSelect(interaction) {
    if (!interaction.customId.startsWith('check_select:')) return;
    
    const sessionId = interaction.customId.replace('check_select:', '');
    // Try both session storages
    const session = checklistSessions?.get(sessionId) || localChecklistSessions.get(sessionId);
    
    if (!session) {
        await interaction.reply({
            content: '⏱️ 세션이 만료되었습니다. 명령어를 다시 실행해주세요.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 선택된 인덱스 저장
    session.selectedIndexes = interaction.values.map(v => parseInt(v));
    
    // 토글 버튼 활성화
    const components = interaction.message.components;
    components[1].components[0].data.disabled = session.selectedIndexes.length === 0;
    
    await interaction.update({
        embeds: interaction.message.embeds,
        components: components
    });
}

/**
 * 체크리스트 버튼 처리
 */
export async function handleCheckButton(interaction) {
    if (!interaction.customId.startsWith('check_')) return;
    
    const parts = interaction.customId.split(':');
    const action = parts[0].replace('check_', '');
    const sessionId = parts[1];
    
    // Try both session storages
    const session = checklistSessions?.get(sessionId) || localChecklistSessions.get(sessionId);
    
    if (!session) {
        await interaction.reply({
            content: '⏱️ 세션이 만료되었습니다. 명령어를 다시 실행해주세요.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    await interaction.deferUpdate();
    
    try {
        // 원본 메시지 가져오기
        const channel = await interaction.guild.channels.fetch(session.channelId);
        const message = await channel.messages.fetch(session.messageId);
        let content = message.content;
        
        switch (action) {
            case 'toggle':
                // 선택된 항목들 토글
                if (session.selectedIndexes.length > 0) {
                    content = toggleChecklistItems(content, session.selectedIndexes);
                    session.selectedIndexes = []; // 선택 초기화
                }
                break;
                
            case 'all':
                // 모두 완료
                content = setAllChecklist(content, true);
                break;
                
            case 'none':
                // 모두 해제
                content = setAllChecklist(content, false);
                break;
        }
        
        // 원본 메시지 업데이트
        await message.edit({ content });
        
        // 체크리스트 다시 파싱
        session.items = parseChecklist(content);
        
        // 진행률 재계산
        const completed = session.items.filter(item => item.checked).length;
        const total = session.items.length;
        const percentage = Math.round((completed / total) * 100);
        
        // 진행률 바 생성
        const barLength = 20;
        const filledLength = Math.round((percentage / 100) * barLength);
        const progressBar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
        
        // Embed 업데이트
        const embed = EmbedBuilder.from(interaction.message.embeds[0]);
        embed.setColor(percentage === 100 ? 0x00FF00 : 0x5865F2);
        embed.data.description = embed.data.description.split('\n')[0] + `\n\n\`${progressBar}\` **${percentage}%**`;
        embed.data.fields[0].value = `${completed}개`;
        embed.data.fields[2].value = `${total - completed}개`;
        
        // 체크리스트 미리보기 업데이트
        const preview = session.items.slice(0, 10).map((item, i) => 
            `${item.checked ? '✅' : '⬜'} ${i + 1}. ${item.text}`
        ).join('\n');
        
        if (session.items.length > 10) {
            embed.data.fields[3].value = preview + `\n... 외 ${session.items.length - 10}개`;
        } else {
            embed.data.fields[3].value = preview;
        }
        
        // 토글 버튼 비활성화 (선택 초기화됨)
        const components = interaction.message.components;
        components[1].components[0].data.disabled = true;
        
        await interaction.editReply({
            embeds: [embed],
            components: components
        });
        
    } catch (error) {
        console.error('체크리스트 업데이트 중 오류:', error);
        await interaction.followUp({
            content: '❌ 체크리스트 업데이트 중 오류가 발생했습니다.',
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 체크리스트 항목 토글
 */
function toggleChecklistItems(content, indexes) {
    const lines = content.split('\n');
    let currentIndex = -1;
    let inChecklist = false;
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('### 체크리스트')) {
            inChecklist = true;
            continue;
        }
        
        if (inChecklist) {
            if (lines[i].startsWith('#') && !lines[i].startsWith('###')) {
                break;
            }
            
            if (lines[i].includes('⬜') || lines[i].includes('☑️')) {
                currentIndex++;
                if (indexes.includes(currentIndex)) {
                    if (lines[i].includes('⬜')) {
                        lines[i] = lines[i].replace('⬜', '☑️');
                    } else {
                        lines[i] = lines[i].replace('☑️', '⬜');
                    }
                }
            }
        }
    }
    
    return lines.join('\n');
}

/**
 * 모든 체크리스트 설정
 */
function setAllChecklist(content, checked) {
    const lines = content.split('\n');
    let inChecklist = false;
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('### 체크리스트')) {
            inChecklist = true;
            continue;
        }
        
        if (inChecklist) {
            if (lines[i].startsWith('#') && !lines[i].startsWith('###')) {
                break;
            }
            
            if (lines[i].includes('⬜') || lines[i].includes('☑️')) {
                lines[i] = lines[i].replace(/[⬜☑️]/, checked ? '☑️' : '⬜');
            }
        }
    }
    
    return lines.join('\n');
}

/**
 * 체크리스트 파싱
 */
function parseChecklist(content) {
    const lines = content.split('\n');
    const items = [];
    let inChecklist = false;
    
    for (const line of lines) {
        if (line.includes('### 체크리스트')) {
            inChecklist = true;
            continue;
        }
        
        if (inChecklist) {
            if (line.startsWith('#') && !line.startsWith('###')) {
                break;
            }
            
            if (line.includes('⬜') || line.includes('☑️')) {
                const checked = line.includes('☑️');
                const text = line.replace(/^[-*\s]*[⬜☑️]\s*/, '').trim();
                if (text) {
                    items.push({ checked, text });
                }
            }
        }
    }
    
    return items;
}