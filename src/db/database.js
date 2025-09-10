import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(
    join(__dirname, '..', '..', 'meeting.db'),
    { verbose: process.env.SQL_DEBUG ? console.log : undefined }
);

export function initDatabase() {
    const createTables = `
        CREATE TABLE IF NOT EXISTS topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            thread_id TEXT,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT '진행중',
            created_by TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );

        CREATE INDEX IF NOT EXISTS idx_guild_status ON topics(guild_id, status);
        CREATE INDEX IF NOT EXISTS idx_message_id ON topics(message_id);
        CREATE INDEX IF NOT EXISTS idx_thread_id ON topics(thread_id);
        
        CREATE TABLE IF NOT EXISTS guild_settings (
            guild_id TEXT PRIMARY KEY,
            tracking_channel_id TEXT,
            command_channel_id TEXT,
            allowed_role_id TEXT,
            summary_channel_id TEXT,
            weekly_summary_enabled INTEGER DEFAULT 1,
            weekly_summary_cron TEXT DEFAULT '0 9 * * MON',
            week_start TEXT DEFAULT 'MON',
            ai_provider TEXT DEFAULT 'gemini',
            gemini_model TEXT DEFAULT 'gemini-2.0-flash-exp',
            ai_api_key_encrypted TEXT,
            mention_suppress INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );
        
        CREATE TABLE IF NOT EXISTS templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            key TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT,
            checklist TEXT,
            visibility TEXT DEFAULT 'guild',
            created_by TEXT NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s','now')),
            updated_at INTEGER DEFAULT (strftime('%s','now'))
        );
        
        CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_guild_key ON templates(guild_id, key);
    `;

    db.exec(createTables);
    
    // 검색 성능을 위한 인덱스 추가
    const createIndexes = `
        CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status);
        CREATE INDEX IF NOT EXISTS idx_topics_created ON topics(created_at);
        CREATE INDEX IF NOT EXISTS idx_topics_guild_status ON topics(guild_id, status);
        CREATE INDEX IF NOT EXISTS idx_topics_created_by ON topics(created_by);
        CREATE INDEX IF NOT EXISTS idx_topics_updated ON topics(updated_at);
    `;
    db.exec(createIndexes);
    
    // 기존 테이블 마이그레이션 (커럼 추가)
    try {
        // guild_settings 테이블에 새로운 커럼들이 있는지 확인
        const tableInfo = db.pragma('table_info(guild_settings)');
        const columns = tableInfo.map(col => col.name);
        
        // 필요한 커럼들 추가
        const columnsToAdd = [
            { name: 'summary_channel_id', type: 'TEXT' },
            { name: 'weekly_summary_enabled', type: 'INTEGER DEFAULT 1' },
            { name: 'weekly_summary_cron', type: "TEXT DEFAULT '0 9 * * MON'" },
            { name: 'week_start', type: "TEXT DEFAULT 'MON'" },
            { name: 'ai_provider', type: "TEXT DEFAULT 'gemini'" },
            { name: 'gemini_model', type: "TEXT DEFAULT 'gemini-2.0-flash-exp'" },
            { name: 'ai_api_key_encrypted', type: 'TEXT' },
            { name: 'mention_suppress', type: 'INTEGER DEFAULT 1' }
        ];
        
        for (const column of columnsToAdd) {
            if (!columns.includes(column.name)) {
                try {
                    db.exec(`ALTER TABLE guild_settings ADD COLUMN ${column.name} ${column.type}`);
                    console.log(`➕ 커럼 추가: ${column.name}`);
                } catch (e) {
                    // 커럼이 이미 존재할 수 있음
                }
            }
        }
    } catch (error) {
        // guild_settings 테이블이 없으면 무시 (위에서 생성됨)
    }
    
    console.log('✅ 데이터베이스가 초기화되었습니다');
}

export function addTopic(data) {
    const stmt = db.prepare(`
        INSERT INTO topics (guild_id, channel_id, message_id, title, status, created_by)
        VALUES (@guild_id, @channel_id, @message_id, @title, @status, @created_by)
    `);

    const result = stmt.run(data);
    return result.lastInsertRowid;
}

export function updateTopicThreadId(topicId, threadId) {
    const stmt = db.prepare(`
        UPDATE topics 
        SET thread_id = ?, updated_at = (strftime('%s','now'))
        WHERE id = ?
    `);

    stmt.run(threadId, topicId);
}

export function getTopic(topicId) {
    const stmt = db.prepare('SELECT * FROM topics WHERE id = ?');
    return stmt.get(topicId);
}

export function getTopics(guildId, statusFilter = '전체') {
    let query = 'SELECT * FROM topics WHERE guild_id = ?';
    const params = [guildId];

    if (statusFilter !== '전체') {
        query += ' AND status = ?';
        params.push(statusFilter);
    }

    query += ' ORDER BY created_at DESC';

    const stmt = db.prepare(query);
    return stmt.all(...params);
}

export function updateTopicStatus(topicId, status) {
    const stmt = db.prepare(`
        UPDATE topics 
        SET status = ?, updated_at = (strftime('%s','now'))
        WHERE id = ?
    `);

    stmt.run(status, topicId);
}

export function getTopicByMessageId(messageId) {
    const stmt = db.prepare('SELECT * FROM topics WHERE message_id = ?');
    return stmt.get(messageId);
}

export function getTopicByThreadId(threadId) {
    const stmt = db.prepare('SELECT * FROM topics WHERE thread_id = ?');
    return stmt.get(threadId);
}

export function updateTopicContent(topicId, content) {
    const stmt = db.prepare(`
        UPDATE topics 
        SET content = ?, updated_at = datetime('now') 
        WHERE id = ?
    `);
    return stmt.run(content, topicId);
}

export function getGuildSettings(guildId) {
    const stmt = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?');
    return stmt.get(guildId);
}

export function searchTopics(guildId, keyword) {
    const stmt = db.prepare(`
        SELECT * FROM topics 
        WHERE guild_id = ? AND title LIKE ? 
        ORDER BY created_at DESC
    `);
    return stmt.all(guildId, `%${keyword}%`);
}

export function getTopicsByFilter(guildId, filter) {
    let query = 'SELECT * FROM topics WHERE guild_id = ?';
    const params = [guildId];
    
    if (filter.status) {
        query += ' AND status = ?';
        params.push(filter.status);
    }
    
    if (filter.createdBy) {
        query += ' AND created_by = ?';
        params.push(filter.createdBy);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
}

export function getTopicsBetween(guildId, startTimestamp, endTimestamp) {
    const stmt = db.prepare(`
        SELECT * FROM topics 
        WHERE guild_id = ? 
        AND ((created_at >= ? AND created_at < ?) 
             OR (updated_at >= ? AND updated_at < ?))
        ORDER BY id DESC
    `);
    return stmt.all(guildId, startTimestamp, endTimestamp, startTimestamp, endTimestamp);
}

export function getTopicsWithMessages(guildId, startTimestamp, endTimestamp) {
    const stmt = db.prepare(`
        SELECT t.*, COUNT(DISTINCT t.id) as topic_count
        FROM topics t
        WHERE t.guild_id = ? 
        AND ((t.created_at >= ? AND t.created_at < ?) 
             OR (t.updated_at >= ? AND t.updated_at < ?))
        GROUP BY t.id
        ORDER BY t.id DESC
    `);
    return stmt.all(guildId, startTimestamp, endTimestamp, startTimestamp, endTimestamp);
}

export function upsertGuildSettings(guildId, settings) {
    const stmt = db.prepare(`
        INSERT INTO guild_settings (
            guild_id, tracking_channel_id, command_channel_id, allowed_role_id,
            summary_channel_id, weekly_summary_enabled, weekly_summary_cron,
            week_start, ai_provider, gemini_model, ai_api_key_encrypted, mention_suppress
        )
        VALUES (
            @guild_id, @tracking_channel_id, @command_channel_id, @allowed_role_id,
            @summary_channel_id, @weekly_summary_enabled, @weekly_summary_cron,
            @week_start, @ai_provider, @gemini_model, @ai_api_key_encrypted, @mention_suppress
        )
        ON CONFLICT(guild_id) DO UPDATE SET
            tracking_channel_id = COALESCE(@tracking_channel_id, tracking_channel_id),
            command_channel_id = COALESCE(@command_channel_id, command_channel_id),
            allowed_role_id = COALESCE(@allowed_role_id, allowed_role_id),
            summary_channel_id = COALESCE(@summary_channel_id, summary_channel_id),
            weekly_summary_enabled = COALESCE(@weekly_summary_enabled, weekly_summary_enabled),
            weekly_summary_cron = COALESCE(@weekly_summary_cron, weekly_summary_cron),
            week_start = COALESCE(@week_start, week_start),
            ai_provider = COALESCE(@ai_provider, ai_provider),
            gemini_model = COALESCE(@gemini_model, gemini_model),
            ai_api_key_encrypted = COALESCE(@ai_api_key_encrypted, ai_api_key_encrypted),
            mention_suppress = COALESCE(@mention_suppress, mention_suppress),
            updated_at = (strftime('%s','now'))
    `);
    
    stmt.run({
        guild_id: guildId,
        tracking_channel_id: settings.tracking_channel_id !== undefined ? settings.tracking_channel_id : undefined,
        command_channel_id: settings.command_channel_id !== undefined ? settings.command_channel_id : undefined,
        allowed_role_id: settings.allowed_role_id !== undefined ? settings.allowed_role_id : undefined,
        summary_channel_id: settings.summary_channel_id !== undefined ? settings.summary_channel_id : undefined,
        weekly_summary_enabled: settings.weekly_summary_enabled !== undefined ? settings.weekly_summary_enabled : undefined,
        weekly_summary_cron: settings.weekly_summary_cron !== undefined ? settings.weekly_summary_cron : undefined,
        week_start: settings.week_start !== undefined ? settings.week_start : undefined,
        ai_provider: settings.ai_provider !== undefined ? settings.ai_provider : undefined,
        gemini_model: settings.gemini_model !== undefined ? settings.gemini_model : undefined,
        ai_api_key_encrypted: settings.ai_api_key_encrypted !== undefined ? settings.ai_api_key_encrypted : undefined,
        mention_suppress: settings.mention_suppress !== undefined ? settings.mention_suppress : undefined
    });
}

export function getAllGuildSettings() {
    const stmt = db.prepare('SELECT * FROM guild_settings WHERE weekly_summary_enabled = 1');
    return stmt.all();
}

/**
 * 안건 삭제
 */
export function deleteTopic(topicId) {
    const stmt = db.prepare('DELETE FROM topics WHERE id = ?');
    const result = stmt.run(topicId);
    return result.changes > 0;
}

/**
 * 템플릿 추가
 */
export function addTemplate(data) {
    const stmt = db.prepare(`
        INSERT INTO templates (guild_id, key, title, body, checklist, visibility, created_by)
        VALUES (@guild_id, @key, @title, @body, @checklist, @visibility, @created_by)
    `);
    
    const result = stmt.run(data);
    return result.lastInsertRowid;
}

/**
 * 템플릿 조회
 */
export function getTemplate(guildId, key) {
    const stmt = db.prepare(`
        SELECT * FROM templates 
        WHERE guild_id = ? AND key = ?
    `);
    return stmt.get(guildId, key);
}

/**
 * 템플릿 목록 조회
 */
export function getTemplates(guildId) {
    const stmt = db.prepare(`
        SELECT * FROM templates 
        WHERE guild_id = ? 
        ORDER BY created_at DESC
    `);
    return stmt.all(guildId);
}

/**
 * 템플릿 업데이트
 */
export function updateTemplate(guildId, key, data) {
    const stmt = db.prepare(`
        UPDATE templates 
        SET title = @title, 
            body = @body, 
            checklist = @checklist,
            updated_at = (strftime('%s','now'))
        WHERE guild_id = @guild_id AND key = @key
    `);
    
    const result = stmt.run({
        guild_id: guildId,
        key: key,
        title: data.title,
        body: data.body,
        checklist: data.checklist
    });
    
    return result.changes > 0;
}

/**
 * 템플릿 삭제
 */
export function deleteTemplate(guildId, key) {
    const stmt = db.prepare(`
        DELETE FROM templates 
        WHERE guild_id = ? AND key = ?
    `);
    
    const result = stmt.run(guildId, key);
    return result.changes > 0;
}

/**
 * 고급 검색 기능
 * @param {Object} params - 검색 파라미터
 * @returns {Object} - { items, total, page, pageSize }
 */
export function advancedSearchTopics(guildId, params = {}) {
    const {
        keyword = '',
        status = null,
        assignee = null,
        fromDate = null,
        toDate = null,
        sort = 'created_at',
        order = 'DESC',
        page = 1,
        pageSize = 10
    } = params;
    
    let query = `
        SELECT t.*,
               (SELECT COUNT(*) FROM topics WHERE guild_id = ?) as total_count
        FROM topics t
        WHERE t.guild_id = ?
    `;
    
    const queryParams = [guildId, guildId];
    const conditions = [];
    
    // 키워드 검색 (제목과 본문)
    if (keyword) {
        conditions.push(`(t.title LIKE ? OR t.body LIKE ?)`);
        const searchPattern = `%${keyword}%`;
        queryParams.push(searchPattern, searchPattern);
    }
    
    // 상태 필터
    if (status) {
        conditions.push(`t.status = ?`);
        queryParams.push(status);
    }
    
    // 담당자 필터
    if (assignee) {
        conditions.push(`t.created_by = ?`);
        queryParams.push(assignee);
    }
    
    // 날짜 범위 필터
    if (fromDate) {
        conditions.push(`t.created_at >= ?`);
        queryParams.push(Math.floor(new Date(fromDate).getTime() / 1000));
    }
    
    if (toDate) {
        conditions.push(`t.created_at <= ?`);
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        queryParams.push(Math.floor(endOfDay.getTime() / 1000));
    }
    
    // WHERE 절 조합
    if (conditions.length > 0) {
        query += ` AND ${conditions.join(' AND ')}`;
    }
    
    // 정렬 (SQL 인젝션 방지를 위해 화이트리스트 사용)
    const validSorts = ['created_at', 'updated_at', 'title', 'status'];
    const validOrders = ['ASC', 'DESC'];
    const sortColumn = validSorts.includes(sort) ? sort : 'created_at';
    const sortOrder = validOrders.includes(order.toUpperCase()) ? order.toUpperCase() : 'DESC';
    
    query += ` ORDER BY t.${sortColumn} ${sortOrder}`;
    
    // 페이징
    const offset = (page - 1) * pageSize;
    query += ` LIMIT ? OFFSET ?`;
    queryParams.push(pageSize, offset);
    
    // 쿼리 실행
    const stmt = db.prepare(query);
    const results = stmt.all(...queryParams);
    
    // 전체 개수 계산 (조건에 맞는)
    let countQuery = `SELECT COUNT(*) as count FROM topics t WHERE t.guild_id = ?`;
    const countParams = [guildId];
    
    if (conditions.length > 0) {
        countQuery += ` AND ${conditions.join(' AND ')}`;
        // 카운트 쿼리용 파라미터 (total_count 제외)
        const conditionParams = queryParams.slice(2, queryParams.length - 2);
        countParams.push(...conditionParams);
    }
    
    const countStmt = db.prepare(countQuery);
    const countResult = countStmt.get(...countParams);
    const total = countResult.count;
    
    return {
        items: results,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
    };
}

export function closeDatabase() {
    db.close();
}

process.on('SIGINT', () => {
    closeDatabase();
    process.exit(0);
});

process.on('SIGTERM', () => {
    closeDatabase();
    process.exit(0);
});
