// 임시 데이터 저장소
// 세션 데이터와 임시 상태를 관리하기 위한 인메모리 저장소

const storage = new Map();

/**
 * 데이터 저장
 * @param {string} key - 저장할 키
 * @param {any} value - 저장할 값
 * @param {number} ttl - 만료 시간(밀리초), 기본값: 30분
 */
export function set(key, value, ttl = 30 * 60 * 1000) {
    const expiresAt = Date.now() + ttl;
    storage.set(key, { value, expiresAt });

    // 만료된 항목 자동 정리
    setTimeout(() => {
        if (storage.has(key)) {
            const item = storage.get(key);
            if (item && item.expiresAt <= Date.now()) {
                storage.delete(key);
            }
        }
    }, ttl);
}

/**
 * 데이터 가져오기
 * @param {string} key - 가져올 키
 * @returns {any} 저장된 값 또는 undefined
 */
export function get(key) {
    const item = storage.get(key);

    if (!item) {
        return undefined;
    }

    // 만료 확인
    if (item.expiresAt <= Date.now()) {
        storage.delete(key);
        return undefined;
    }

    return item.value;
}

/**
 * 데이터 삭제
 * @param {string} key - 삭제할 키
 */
export function remove(key) {
    storage.delete(key);
}

/**
 * 특정 패턴의 키 모두 삭제
 * @param {string} pattern - 키 패턴 (예: "user_123_*")
 */
export function removePattern(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of storage.keys()) {
        if (regex.test(key)) {
            storage.delete(key);
        }
    }
}

/**
 * 모든 데이터 삭제
 */
export function clear() {
    storage.clear();
}

/**
 * 저장소 크기 확인
 * @returns {number} 저장된 항목 수
 */
export function size() {
    // 만료된 항목 정리
    const now = Date.now();
    for (const [key, item] of storage.entries()) {
        if (item.expiresAt <= now) {
            storage.delete(key);
        }
    }
    return storage.size;
}

/**
 * 디버깅용: 모든 키 목록
 * @returns {Array<string>} 키 목록
 */
export function keys() {
    return Array.from(storage.keys());
}

// 주기적인 만료 항목 정리 (5분마다)
setInterval(() => {
    const now = Date.now();
    for (const [key, item] of storage.entries()) {
        if (item.expiresAt <= now) {
            storage.delete(key);
        }
    }
}, 5 * 60 * 1000);

export default {
    set,
    get,
    remove,
    removePattern,
    clear,
    size,
    keys
};