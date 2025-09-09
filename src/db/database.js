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
    `;

    db.exec(createTables);
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
