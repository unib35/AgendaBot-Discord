import crypto from 'crypto';

// 암호화 키 - 환경변수에서 가져오거나 기본값 사용 (프로덕션에서는 반드시 변경)
const SECRET = process.env.ENCRYPTION_SECRET || 'dev-secret-please-change-in-production';

/**
 * 텍스트를 AES-256-GCM으로 암호화
 * @param {string} text - 암호화할 텍스트
 * @returns {string} Base64 인코딩된 암호화 데이터
 */
export function encrypt(text) {
    if (!text) return null;
    
    try {
        // 12바이트 초기화 벡터 생성
        const iv = crypto.randomBytes(12);
        
        // 시크릿을 SHA-256으로 해싱하여 32바이트 키 생성
        const key = crypto.createHash('sha256').update(SECRET).digest();
        
        // AES-256-GCM 암호화
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const encrypted = Buffer.concat([
            cipher.update(text, 'utf8'),
            cipher.final()
        ]);
        
        // 인증 태그 가져오기
        const authTag = cipher.getAuthTag();
        
        // IV + 인증태그 + 암호화된 데이터를 합쳐서 Base64로 인코딩
        return Buffer.concat([iv, authTag, encrypted]).toString('base64');
    } catch (error) {
        console.error('암호화 오류:', error);
        return null;
    }
}

/**
 * Base64 암호화 데이터를 복호화
 * @param {string} encryptedData - Base64 인코딩된 암호화 데이터
 * @returns {string} 복호화된 텍스트
 */
export function decrypt(encryptedData) {
    if (!encryptedData) return null;
    
    try {
        // Base64 디코딩
        const buffer = Buffer.from(encryptedData, 'base64');
        
        // 데이터 분리: IV(12) + 인증태그(16) + 암호화된 데이터
        const iv = buffer.subarray(0, 12);
        const authTag = buffer.subarray(12, 28);
        const encrypted = buffer.subarray(28);
        
        // 시크릿을 SHA-256으로 해싱하여 32바이트 키 생성
        const key = crypto.createHash('sha256').update(SECRET).digest();
        
        // AES-256-GCM 복호화
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        
        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final()
        ]);
        
        return decrypted.toString('utf8');
    } catch (error) {
        console.error('복호화 오류:', error);
        return null;
    }
}

/**
 * 암호화 키 검증 (테스트용)
 * @returns {boolean} 암호화/복호화가 정상 작동하는지 여부
 */
export function testEncryption() {
    try {
        const testText = 'test-api-key-12345';
        const encrypted = encrypt(testText);
        const decrypted = decrypt(encrypted);
        return decrypted === testText;
    } catch (error) {
        console.error('암호화 테스트 실패:', error);
        return false;
    }
}