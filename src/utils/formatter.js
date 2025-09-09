const STATUS_EMOJIS = {
    '진행중': '🧭',
    '완료': '✅',
    '보류': '⏸️',
    '취소': '❌',
    '검토중': '🔄',
    '대기중': '⏳'
};

export function formatAgendaTitle(id, title, status) {
    const emoji = STATUS_EMOJIS[status] || '🧭';
    const statusText = `${emoji} ${status}`;
    const prefix = `[${statusText}] #${id} `;
    const MAX = 100; // Discord thread name hard limit
    const maxTitleLen = Math.max(0, MAX - prefix.length);
    const trimmed = title.length > maxTitleLen
        ? title.slice(0, Math.max(0, maxTitleLen - 1)) + (maxTitleLen > 0 ? '…' : '')
        : title;
    return `${prefix}${trimmed}`;
}

export function replaceCheckboxes(content) {
    return content.replace(/⬜/g, '☑️');
}

export function toggleCheckbox(content, itemNumber) {
    const lines = content.split('\n');
    let checkboxCount = 0;
    let foundIndex = -1;
    let isChecked = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('⬜') || line.includes('☑️')) {
            checkboxCount++;
            if (checkboxCount === itemNumber) {
                foundIndex = i;
                isChecked = line.includes('☑️');
                break;
            }
        }
    }
    
    if (foundIndex === -1) {
        return {
            success: false,
            message: `❌ ${itemNumber}번째 체크박스를 찾을 수 없습니다. (총 ${checkboxCount}개의 체크박스 발견)`
        };
    }
    
    if (isChecked) {
        lines[foundIndex] = lines[foundIndex].replace('☑️', '⬜');
    } else {
        lines[foundIndex] = lines[foundIndex].replace('⬜', '☑️');
    }
    
    return {
        success: true,
        content: lines.join('\n'),
        checked: !isChecked
    };
}

export function parseChecklistItems(content) {
    const lines = content.split('\n');
    const items = [];
    
    lines.forEach((line, index) => {
        if (line.includes('⬜') || line.includes('☑️')) {
            items.push({
                lineIndex: index,
                checked: line.includes('☑️'),
                text: line.replace(/[⬜☑️]/g, '').trim()
            });
        }
    });
    
    return items;
}

export function formatTimestamp(date) {
    const timezone = process.env.TIMEZONE || 'Asia/Seoul';
    return new Intl.DateTimeFormat('ko-KR', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(new Date(date));
}

export function sanitizeMarkdown(text) {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/\*/g, '\\*')
        .replace(/_/g, '\\_')
        .replace(/~/g, '\\~')
        .replace(/`/g, '\\`')
        .replace(/>/g, '\\>')
        .replace(/\|/g, '\\|');
}

export function createAgendaCard({ id, title, background, goal, owner, deadline, notes }) {
    // 기본값 처리
    const ownerDisplay = owner || '@미정';
    const deadlineDisplay = deadline || '미정';
    const status = '🧭 진행중';
    
    // ID가 있으면 포함, 없으면 제목만
    const titleLine = id ? `# 안건 #${id} : ${title}` : `# 안건: ${title}`;
    
    let cardContent = `${titleLine}

**배경**
${background}

**목표**
${goal}

**담당**
${ownerDisplay}

**마감**
${deadlineDisplay}`;

    // 추가 메모가 있으면 포함
    if (notes) {
        cardContent += `\n\n**메모**\n${notes}`;
    }
    
    cardContent += `\n\n**회의록**
📝 작성 전

**상태**
${status}

### 체크리스트
⬜ 진행 상황 확인
⬜ 관련 자료 준비
⬜ 검토 및 피드백
⬜ 최종 확정`;
    
    return cardContent;
}

export function toggleAllCheckboxes(content, markAsChecked) {
    const lines = content.split('\n');
    let checkboxCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('⬜') || line.includes('☑️')) {
            checkboxCount++;
            if (markAsChecked) {
                lines[i] = line.replace(/⬜/g, '☑️');
            } else {
                lines[i] = line.replace(/☑️/g, '⬜');
            }
        }
    }
    
    if (checkboxCount === 0) {
        return {
            success: false,
            message: '❌ 체크박스를 찾을 수 없습니다.'
        };
    }
    
    return {
        success: true,
        content: lines.join('\n'),
        count: checkboxCount,
        action: markAsChecked ? 'checked' : 'unchecked'
    };
}

export function getChecklistProgress(content) {
    const lines = content.split('\n');
    let total = 0;
    let checked = 0;
    
    for (const line of lines) {
        if (line.includes('⬜')) {
            total++;
        } else if (line.includes('☑️')) {
            total++;
            checked++;
        }
    }
    
    if (total === 0) {
        return null;
    }
    
    const percentage = Math.round((checked / total) * 100);
    return {
        checked,
        total,
        percentage,
        display: `${checked}/${total} (${percentage}%)`
    };
}

export function addChecklistItem(content, item) {
    const lines = content.split('\n');
    const checklistIndex = lines.findIndex(line => line.includes('### 체크리스트'));
    
    if (checklistIndex === -1) {
        // 체크리스트 섹션이 없으면 추가
        return content + '\n\n### 체크리스트\n⬜ ' + item;
    }
    
    // 체크리스트 섹션 끝 찾기
    let insertIndex = checklistIndex + 1;
    while (insertIndex < lines.length && (lines[insertIndex].includes('⬜') || lines[insertIndex].includes('☑️') || lines[insertIndex].trim() === '')) {
        insertIndex++;
    }
    
    // 새 항목 삽입
    lines.splice(insertIndex, 0, '⬜ ' + item);
    return lines.join('\n');
}
