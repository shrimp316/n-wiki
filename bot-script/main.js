// ============================================================
// N-wiki 오픈채팅 봇 스크립트 (메신저봇R / Rhino JS ES5)
// ============================================================
// 설정 방법:
//   1. SERVER_URL, BOT_SECRET, TARGET_ROOM, BOT_NAME을 실제 값으로 교체
//   2. 메신저봇R에서 컴파일 → 재시작
//   3. webhook.site로 먼저 검증 후 실서버로 전환
// ============================================================

var SERVER_URL    = 'https://your-site.vercel.app'; // ← 실제 Vercel URL
var BOT_SECRET    = '0b65f2f6ace33abf1a99c401ed46a1b2e7d3556a62cbc5f086d8cb051353f8fb';          // ← BOT_SECRET 환경변수와 동일
var TARGET_ROOM   = 'n의 언어';                      // ← 정확한 채팅방 이름
var BOT_NAME      = 'John smith [bot]';                        // ← 봇 카카오 계정 닉네임
var SMITH_NAME    = '스미스';                          // ← 명령어 트리거 호출명
var POLL_INTERVAL = 5 * 60 * 1000;                   // 5분 (ms)

var pollThread = null;

// ── 채팅 수신 콜백 ─────────────────────────────────────────
function response(room, msg, sender, isGroupChat, replier, isMention, packageName) {
  if (room !== TARGET_ROOM) return;
  if (sender === BOT_NAME) return;

  var trimmed = msg.trim();

  // 스미스 호출 감지 → 명령어 파싱
  var smithCmd = parseSmithCommand(trimmed);
  if (smithCmd !== null) {
    if (smithCmd !== 'unknown') {
      var cmdPayload = JSON.stringify({
        command: smithCmd,
        triggered_by: sender,
        room: room
      });
      try {
        httpPost(SERVER_URL + '/api/bot/command', cmdPayload);
      } catch (e) {
        Log.error('[Bot] command 전송 실패: ' + e);
      }
    }
    return; // 스미스에게 한 말은 채팅 기록에서 제외
  }

  // 일반 채팅 수집
  var payload = JSON.stringify({
    room: room,
    sender: sender,
    text: msg,
    received_at: new Date().toISOString()
  });

  try {
    httpPost(SERVER_URL + '/api/bot/ingest', payload);
  } catch (e) {
    Log.error('[Bot] ingest 실패: ' + e);
  }
}

// ── 스미스 명령어 파서 ─────────────────────────────────────
// 반환값: 명령 문자열 | 'unknown' | null
//   null    → 스미스 호출 없음 (일반 채팅)
//   'unknown' → 스미스 호출했지만 모르는 명령
//   그 외   → /api/bot/command로 전달할 command 값
function parseSmithCommand(msg) {
  if (msg.indexOf(SMITH_NAME) === -1) return null;

  if (msg.indexOf('요약') !== -1) return 'summarize-now';

  // 추후 명령어 확장 예시:
  // if (msg.indexOf('인기') !== -1 || msg.indexOf('top5') !== -1) return 'top5';
  // if (msg.indexOf('도움') !== -1 || msg.indexOf('help') !== -1) return 'help';

  Log.i('[Bot] 스미스 호출됨, 알 수 없는 명령: ' + msg);
  return 'unknown';
}

// ── 스크립트 시작 시 폴러 실행 ────────────────────────────
function onCreate() {
  startPoller();
  Log.i('[Bot] 시작됨. 채팅방: ' + TARGET_ROOM);
}

// ── Outbox 폴러 ────────────────────────────────────────────
function startPoller() {
  if (pollThread !== null && pollThread.isAlive()) return;

  pollThread = new java.lang.Thread(new java.lang.Runnable({
    run: function () {
      Log.i('[Bot] 폴러 시작');
      try {
        while (true) {
          try {
            pollOutbox();
          } catch (e) {
            Log.error('[Bot] 폴러 오류: ' + e);
          }
          try {
            java.lang.Thread.sleep(POLL_INTERVAL);
          } catch (ie) {
            // InterruptedException — 정상 종료
            break;
          }
        }
      } finally {
        pollThread = null;
        Log.i('[Bot] 폴러 종료');
      }
    }
  }));
  pollThread.setDaemon(true);
  pollThread.start();
}

function pollOutbox() {
  var body = httpGet(SERVER_URL + '/api/bot/outbox');
  if (!body) return;

  var items;
  try {
    items = JSON.parse(body);
  } catch (e) {
    Log.error('[Bot] outbox JSON 파싱 실패: ' + e);
    return;
  }

  if (!items || items.length === 0) return;

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var sent = false;
    try {
      Api.replyRoom(item.room, item.message);
      sent = true;
    } catch (e) {
      Log.error('[Bot] replyRoom 실패: ' + e);
    }
    ack(item.id, sent ? 'sent' : 'failed');
  }
}

function ack(id, status) {
  var payload = JSON.stringify({ id: id, status: status });
  try {
    httpPost(SERVER_URL + '/api/bot/outbox/ack', payload);
  } catch (e) {
    Log.error('[Bot] ACK 실패 (id=' + id + '): ' + e);
  }
}

// ── HTTP 유틸 (java.net) ───────────────────────────────────
function httpPost(url, body) {
  var conn = new java.net.URL(url).openConnection();
  conn.setRequestMethod('POST');
  conn.setRequestProperty('Content-Type', 'application/json');
  conn.setRequestProperty('X-Bot-Secret', BOT_SECRET);
  conn.setConnectTimeout(10000);
  conn.setReadTimeout(10000);
  conn.setDoOutput(true);

  var os = conn.getOutputStream();
  os.write(new java.lang.String(body).getBytes('UTF-8'));
  os.flush();
  os.close();

  var code = conn.getResponseCode();
  if (code >= 400) {
    Log.error('[Bot] POST ' + url + ' → HTTP ' + code);
  }
  conn.disconnect();
  return code;
}

function httpGet(url) {
  var conn = new java.net.URL(url).openConnection();
  conn.setRequestMethod('GET');
  conn.setRequestProperty('X-Bot-Secret', BOT_SECRET);
  conn.setConnectTimeout(10000);
  conn.setReadTimeout(10000);

  var code = conn.getResponseCode();
  if (code !== 200) {
    if (code >= 400) {
      Log.error('[Bot] GET ' + url + ' → HTTP ' + code);
    }
    conn.disconnect();
    return null;
  }

  var br = new java.io.BufferedReader(
    new java.io.InputStreamReader(conn.getInputStream(), 'UTF-8')
  );
  var sb = new java.lang.StringBuilder();
  var line;
  while ((line = br.readLine()) !== null) {
    sb.append(line);
  }
  br.close();
  conn.disconnect();
  return sb.toString();
}
