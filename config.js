// Supabase 연결 설정
// Supabase 대시보드 → Project Settings → API (또는 API Keys) 에서 복사해 넣으세요.
// - SUPABASE_URL: Project URL (예: https://abcdefgh.supabase.co)
// - SUPABASE_ANON_KEY: "anon public" 키 또는 "publishable" 키 (sb_publishable_...)
//
// 이 키는 공개 저장소에 올라가도 괜찮은 키입니다.
// 메모는 supabase.sql에서 정한 "비밀 키"를 아는 사람만 읽고 쓸 수 있습니다.
// (비밀 키는 여기에 적지 마세요. 각 기기에서 처음 한 번 화면에 입력합니다.)
// (절대 service_role / secret 키를 넣지 마세요!)
//
// 두 값이 비어 있으면 동기화 없이 이 브라우저에만 저장하는 "로컬 모드"로 동작합니다.
window.MEMO_CONFIG = {
  SUPABASE_URL: "https://yfmxbbcknsupopjdkuhp.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmbXhiYmNrbnN1cG9wamRrdWhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MTQ1MzEsImV4cCI6MjExMDA5MDUzMX0.esE8gg6PwLZBorrJUpLmL2Y83gUoYEC6bpjz7LIZBw0",
};
