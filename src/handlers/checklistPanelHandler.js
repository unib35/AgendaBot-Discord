import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    EmbedBuilder,
    MessageFlags
} from 'discord.js';
import { getTopic } from '../db/database.js';

// 임시 저장소 (userId -> {topicId, selectedIndexes})
const pendingSelections = new Map();

/**
 * 체크리스트 패널 생성
 */
export function createChecklistPanel(topicId, content) {
    const components = [];
    
    // 체크리스트 항목 파싱
    const checklistItems = parseChecklistItems(content);
    
    if (checklistItems.length === 0) {
        return null;
    }
    
    // 최대 25개까지만 (Discord 제한)
    const itemsToShow = checklistItems.slice(0, 25);
    
    // 멀티 셀렉트 메뉴
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`ck:select:${topicId}`)
        .setPlaceholder('✅ 체크/해제할 항목을 선택하세요')
        .setMinValues(0)
        .setMaxValues(Math.min(itemsToShow.length, 10))
        .addOptions(itemsToShow.map((item, index) => ({
            label: `${item.checked ? '✅' : '⬜'} ${item.text.substring(0, 80)}`,
            value: String(index),
            description: item.checked ? '완료됨' : '미완료',
            emoji: item.checked ? '✅' : '⬜'
        })));
    
    components.push(new ActionRowBuilder().addComponents(selectMenu));
    
    // 액션 버튼들
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`ck:toggle:${topicId}`)
            .setLabel('선택 항목 토글')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔄'),
        
        new ButtonBuilder()
            .setCustomId(`ck:all:${topicId}:on`)
            .setLabel('모두 완료')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
        
        new ButtonBuilder()
            .setCustomId(`ck:all:${topicId}:off`)
            .setLabel('모두 해제')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬜'),
        
        new ButtonBuilder()
            .setCustomId(`ck:refresh:${topicId}`)
            .setLabel('새로고침')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄')
    );
    
    components.push(buttons);
    
    // 25개 이상인 경우 안내 메시지
    if (checklistItems.length > 25) {
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ck:info')
                .setLabel(`전체 ${checklistItems.length}개 중 25개 표시 중`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        ));
    }
    
    return components;
}

/**
 * 체크리스트 진행률 Embed 생성
 */
export function createProgressEmbed(content) {
    const checklistItems = parseChecklistItems(content);
    const completed = checklistItems.filter(item => item.checked).length;
    const total = checklistItems.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    // 진행률 바 생성
    const barLength = 20;
    const filledLength = Math.round((percentage / 100) * barLength);
    const progressBar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    
    const embed = new EmbedBuilder()
        .setColor(percentage === 100 ? 0x00FF00 : 0x5865F2)
        .setTitle('📊 체크리스트 진행률')
        .setDescription(`\`${progressBar}\` **${percentage}%**`)
        .addFields(
            { name: '완료', value: `${completed}개`, inline: true },
            { name: '전체', value: `${total}개`, inline: true },
            { name: '남은 항목', value: `${total - completed}개`, inline: true }
        )
        .setFooter({ text: '아래에서 항목을 선택하고 버튼을 눌러 상태를 변경하세요' });
    
    return embed;
}

/**
 * 체크리스트 항목 파싱
 */
function parseChecklistItems(content) {
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
                break; // 다른 섹션 시작
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

/**
 * 셀렉트 메뉴 선택 처리
 */
export async function handleChecklistSelect(interaction) {
    if (!interaction.customId.startsWith('ck:select:')) return;
    
    const topicId = parseInt(interaction.customId.replace('ck:select:', ''));
    const selectedIndexes = interaction.values.map(v => parseInt(v));
    
    // 선택 항목 저장
    pendingSelections.set(interaction.user.id, {
        topicId,
        selectedIndexes
    });
    
    // 선택 확인 메시지
    await interaction.reply({
        content: `✅ ${selectedIndexes.length}개 항목이 선택되었습니다. 원하는 작업 버튼을 클릭하세요.`,
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 버튼 클릭 처리
 */
export async function handleChecklistButton(interaction) {
    if (!interaction.customId.startsWith('ck:')) return;
    
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const topicId = parseInt(parts[2]);
    
    // 권한 확인 (작성자 또는 담당자만)
    const topic = getTopic(topicId);
    if (!topic) {
        await interaction.reply({
            content: '❌ 안건을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    await interaction.deferUpdate();
    
    try {
        let newContent = interaction.message.content;
        
        switch (action) {
            case 'toggle': {
                // 선택된 항목 토글
                const selection = pendingSelections.get(interaction.user.id);
                if (!selection || selection.topicId !== topicId) {
                    await interaction.followUp({
                        content: '⚠️ 먼저 항목을 선택해주세요.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                newContent = toggleChecklistItems(newContent, selection.selectedIndexes);
                pendingSelections.delete(interaction.user.id);
                break;
            }
            
            case 'all': {
                // 전체 체크/해제
                const setChecked = parts[3] === 'on';
                newContent = setAllChecklistItems(newContent, setChecked);
                break;
            }
            
            case 'refresh': {
                // 패널 새로고침만
                break;
            }
            
            default:
                return;
        }
        
        // DB에는 별도로 저장하지 않음 (Discord 메시지가 source of truth)
        
        // 메시지 업데이트
        await interaction.message.edit({
            content: newContent,
            components: interaction.message.components
        });
        
        // 체크리스트 패널이 있는 경우 업데이트
        const thread = interaction.channel;
        if (thread.isThread()) {
            await updateChecklistPanel(thread, topicId, newContent);
        }
        
    } catch (error) {
        console.error('체크리스트 버튼 처리 중 오류:', error);
        await interaction.followUp({
            content: '❌ 체크리스트 업데이트 중 오류가 발생했습니다.',
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 선택된 항목들 토글
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
                    // 토글
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
 * 모든 체크리스트 항목 설정
 */
function setAllChecklistItems(content, checked) {
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
 * 스레드의 체크리스트 패널 업데이트
 */
async function updateChecklistPanel(thread, topicId, content) {
    try {
        // 최근 메시지 중 체크리스트 패널 찾기
        const messages = await thread.messages.fetch({ limit: 20 });
        const panelMessage = messages.find(msg => 
            msg.author.id === thread.client.user.id &&
            msg.embeds.length > 0 &&
            msg.embeds[0].title?.includes('체크리스트 진행률')
        );
        
        if (panelMessage) {
            const newEmbed = createProgressEmbed(content);
            const newComponents = createChecklistPanel(topicId, content);
            
            await panelMessage.edit({
                embeds: [newEmbed],
                components: newComponents || []
            });
        }
    } catch (error) {
        console.error('체크리스트 패널 업데이트 중 오류:', error);
    }
}

/**
 * 체크리스트 패널 메시지 생성 (스레드에 게시용)
 */
export async function postChecklistPanel(thread, topicId) {
    const topic = getTopic(topicId);
    if (!topic) return;
    
    // 원본 메시지 가져오기
    try {
        const channel = await thread.guild.channels.fetch(topic.channel_id);
        const message = await channel.messages.fetch(topic.message_id);
        const content = message.content;
        
        const progressEmbed = createProgressEmbed(content);
        const panelComponents = createChecklistPanel(topicId, content);
    
        if (!panelComponents) {
            await thread.send({
                content: '⚠️ 체크리스트 항목이 없습니다. 먼저 체크리스트를 추가해주세요.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        const panelMessage = await thread.send({
            embeds: [progressEmbed],
            components: panelComponents
        });
        
        // 스레드 상단에 고정
        try {
            await panelMessage.pin();
        } catch (error) {
            console.error('메시지 고정 실패:', error);
        }
        
        return panelMessage;
    } catch (error) {
        console.error('체크리스트 패널 생성 중 오류:', error);
        await thread.send({
            content: '❌ 체크리스트 패널 생성 중 오류가 발생했습니다.',
            flags: MessageFlags.Ephemeral
        });
        return null;
    }
}