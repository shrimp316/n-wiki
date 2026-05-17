# n위키 리디자인 v2 — 적용 가이드

## 이번 업데이트에서 추가된 것

| 파일 | 변경 내용 |
|------|----------|
| `page.tsx` | 찬반의견 탭에 **인라인 찬성/반대 버튼** 추가, 찬반 비율 바 표시 |
| `wiki-slug-page.tsx` | **카카오 담론에도 댓글** 표시 (기존엔 개념·토론만 가능) |
| `discussion-id-page.tsx` | 새 글래스모피즘 디자인 적용, 발언 에디터 스타일 업데이트 |

---

## 파일 복사 위치

```
new-components/page.tsx               →  app/page.tsx
new-components/wiki-slug-page.tsx     →  app/wiki/[slug]/page.tsx
new-components/discussion-id-page.tsx →  app/discussions/[id]/page.tsx
new-components/AppHeader.tsx          →  components/AppHeader.tsx
new-components/BottomNav.tsx          →  components/BottomNav.tsx
new-components/Sidebar.tsx            →  components/Sidebar.tsx
new-components/layout.tsx             →  app/layout.tsx
new-components/globals.css            →  app/globals.css
```

## 찬반 인라인 투표 동작 방식

- 카드 제목 클릭 → 상세 페이지 이동
- 찬성/반대 버튼 클릭 → 즉각 투표 (Supabase `discussion_participants` 직접 insert)
- 이미 투표한 경우 → 버튼 비활성화, "토론 참여하기 →" 링크 표시
- 로그인 안 한 경우 → `/auth/login` 리다이렉트
- 종료된 토론 → "결과 보기 →" 링크로 대체

## 담론 댓글 변경 사항

`app/wiki/[slug]/page.tsx` 에서 기존:
```tsx
{(doc.type === 'concept' || doc.type === 'discussion') && (
  <Comments documentId={doc.id} />
)}
```

변경 후 (kakao 포함 모든 타입):
```tsx
<Comments documentId={doc.id} />
```
