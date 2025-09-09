# 🤝 기여 가이드

AgendaBot 프로젝트에 기여해주셔서 감사합니다! 이 문서는 프로젝트에 기여하는 방법을 안내합니다.

## 📋 목차

- [행동 강령](#행동-강령)
- [어떻게 기여할 수 있나요?](#어떻게-기여할-수-있나요)
- [개발 환경 설정](#개발-환경-설정)
- [코드 스타일](#코드-스타일)
- [커밋 메시지 규칙](#커밋-메시지-규칙)
- [Pull Request 프로세스](#pull-request-프로세스)

## 행동 강령

- 모든 참여자를 존중하고 배려해주세요
- 건설적인 피드백을 제공해주세요
- 커뮤니티 이익을 우선시해주세요

## 어떻게 기여할 수 있나요?

### 🐛 버그 신고

1. [Issues](https://github.com/yourusername/AgendaBot/issues)에서 이미 보고된 버그인지 확인
2. 새 이슈 생성 시 다음 정보 포함:
   - 버그 설명
   - 재현 방법
   - 예상 동작
   - 실제 동작
   - 환경 정보 (Node.js 버전, OS 등)

### 💡 기능 제안

1. [Issues](https://github.com/yourusername/AgendaBot/issues)에서 유사한 제안 확인
2. 새 이슈 생성 시 다음 정보 포함:
   - 기능 설명
   - 사용 사례
   - 예상 구현 방법

### 📝 문서 개선

- README, 가이드, 코드 주석 개선
- 오타 수정
- 번역 추가

### 💻 코드 기여

1. Fork 후 feature 브랜치 생성
2. 코드 작성 및 테스트
3. Pull Request 제출

## 개발 환경 설정

### 1. 저장소 Fork 및 Clone

```bash
# Fork 후 clone
git clone https://github.com/yourusername/AgendaBot.git
cd AgendaBot

# upstream 추가
git remote add upstream https://github.com/original/AgendaBot.git
```

### 2. 브랜치 생성

```bash
# 최신 코드 동기화
git fetch upstream
git checkout main
git merge upstream/main

# feature 브랜치 생성
git checkout -b feature/your-feature-name
```

### 3. 개발 환경 준비

```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일 편집

# 개발 모드 실행
npm run dev
```

### 4. 테스트 봇 설정

1. [Discord Developer Portal](https://discord.com/developers/applications)에서 테스트 봇 생성
2. 봇을 테스트 서버에 초대
3. `.env`에 테스트 봇 토큰 설정

## 코드 스타일

### JavaScript/Node.js

- ES6+ 문법 사용
- async/await 선호
- 의미있는 변수명 사용
- 한국어 주석 가능

### 예시

```javascript
// ✅ Good
async function addAgenda(guildId, title, description) {
    try {
        const agendaId = await db.addTopic({
            guild_id: guildId,
            title,
            description
        });
        return agendaId;
    } catch (error) {
        console.error('안건 추가 중 오류:', error);
        throw error;
    }
}

// ❌ Bad
function add(g, t, d) {
    db.addTopic({ guild_id: g, title: t, description: d })
        .then(id => id)
        .catch(e => console.log(e));
}
```

### 파일 구조

```
src/
├── commands/       # 슬래시 명령어 (1파일 = 1명령어)
├── handlers/       # 이벤트 핸들러
├── db/            # 데이터베이스 관련
├── utils/         # 유틸리티 함수
└── ai/            # AI 통합
```

## 커밋 메시지 규칙

### 형식

```
<type>: <subject>

<body>

<footer>
```

### Type

- `feat`: 새로운 기능
- `fix`: 버그 수정
- `docs`: 문서 변경
- `style`: 코드 포맷팅
- `refactor`: 리팩토링
- `test`: 테스트 추가/수정
- `chore`: 빌드, 설정 변경

### 예시

```
feat: 안건 일괄 삭제 명령어 추가

- /deleteall 명령어 구현
- 관리자 권한 체크 추가
- 확인 모달 구현

Closes #123
```

## Pull Request 프로세스

### 1. PR 제출 전 체크리스트

- [ ] 코드가 정상 작동하는가?
- [ ] 기존 기능을 깨뜨리지 않는가?
- [ ] 커밋 메시지가 규칙을 따르는가?
- [ ] 필요한 문서를 업데이트했는가?

### 2. PR 템플릿

```markdown
## 변경 사항
<!-- 무엇을 변경했는지 설명 -->

## 변경 이유
<!-- 왜 이 변경이 필요한지 설명 -->

## 테스트
<!-- 어떻게 테스트했는지 설명 -->

## 체크리스트
- [ ] 코드 스타일 가이드 준수
- [ ] 자체 테스트 완료
- [ ] 문서 업데이트 (필요시)

## 관련 이슈
Closes #(issue)
```

### 3. 리뷰 프로세스

1. PR 제출 후 리뷰어 할당 대기
2. 피드백 반영
3. 승인 후 머지

## 테스트

### 수동 테스트

```bash
# 명령어 배포
npm run deploy

# 봇 실행
npm run dev

# 각 명령어 테스트
# /add, /done, /list 등
```

### 테스트 시나리오

1. **안건 생성 플로우**
   - `/add` → 담당자 선택 → 정보 입력
   - 스레드 생성 확인
   - 첫 댓글 확인

2. **체크리스트 관리**
   - `/check` 개별 토글
   - `/checkall` 일괄 처리
   - 진행률 업데이트 확인

3. **AI 요약**
   - `/setupkey` API 키 설정
   - `/testsummary` 테스트
   - `/summary` 실제 요약

## 질문 및 도움

- [Issues](https://github.com/yourusername/AgendaBot/issues)에 질문 남기기
- Discord 서버 참여: [링크]
- 이메일: your-email@example.com

## 라이선스

기여하신 코드는 프로젝트의 MIT 라이선스를 따릅니다.

---

감사합니다! 여러분의 기여가 AgendaBot을 더 좋은 프로젝트로 만듭니다. 🎉