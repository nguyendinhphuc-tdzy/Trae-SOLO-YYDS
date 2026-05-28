# UI Dashboard Spec (Ops Control Center)
  
Mục tiêu: tài liệu để team triển khai nhanh UI Dashboard nội bộ cho workflow WhatsApp → Gemini → Jira, với data source chính là Jira realtime + Supabase (state/log/conversation/analytics).
  
Phạm vi: mô tả screens, elements, dữ liệu hiển thị, user flows, và contract API giữa Frontend ↔ Backend (bạn sẽ làm backend, 1 thành viên khác làm frontend).
  
Repo hiện tại là service Node.js không có UI; luồng xử lý chính nằm ở [index.js](file:///c:/Users/PC/Downloads/Trae%20SOLO%20YYDS/index.js), ingestion WhatsApp ở [whatsappIngestion.js](file:///c:/Users/PC/Downloads/Trae%20SOLO%20YYDS/src/services/whatsappIngestion.js), state Supabase ở [supabaseService.js](file:///c:/Users/PC/Downloads/Trae%20SOLO%20YYDS/src/services/supabaseService.js), thực thi Jira ở [jiraService.js](file:///c:/Users/PC/Downloads/Trae%20SOLO%20YYDS/src/services/jiraService.js), AI decision ở [aiService.js](file:///c:/Users/PC/Downloads/Trae%20SOLO%20YYDS/src/services/aiService.js).
  
---
  
## 1) Tóm tắt yêu cầu (đã xác nhận)
  
- UI dùng nội bộ 1 team (Ops).
- Request được gom theo conversation (không phải từng message đơn lẻ).
- UI cần theo dõi:
  - Bảng tổng hợp request (conversation) theo khách hàng và nội dung.
  - Trạng thái xử lý và assignee của task (Jira) theo thời gian thực.
  - Tổng hợp đã giải quyết + phân tích nguyên nhân/nhóm request nhiều nhất + nhận diện trùng lặp với request trước.
- Data source:
  - Jira realtime cho Tasks (source of truth).
  - Supabase luôn có mặt để lưu state/log/conversation, làm join/analytics và làm “index” cho UI.
- Triển khai nhanh: ưu tiên “ít nhất có thể” nhưng đủ để vận hành.
  
---
  
## 2) Nguyên tắc thiết kế (UX/UI)
  
- UI là “command center”: ưu tiên khả năng scan nhanh, lọc nhanh, drill-down nhanh.
- 80/20: cung cấp actions quan trọng nhất ngay tại list (open issue, copy link, assign, mark done, tag).
- Dữ liệu có thể “eventually consistent” giữa Jira ↔ Supabase; UI cần hiển thị trạng thái đồng bộ (fresh/stale).
- Có “guardrails” khi chạy allow_all/test: cảnh báo rủi ro spam/ticket rác.
  
---
  
## 3) Data Model tối thiểu (Supabase) cho UI
  
Hiện repo chỉ có `vip_clients` và `event_logs` trong [schema.sql](file:///c:/Users/PC/Downloads/Trae%20SOLO%20YYDS/supabase/schema.sql). Để làm UI conversation + analytics, cần bổ sung tối thiểu các bảng sau (đề xuất):
  
### 3.1 `clients`
  
Mục tiêu: quản lý danh bạ nội bộ + gắn label ổn định với Jira.
  
- `id uuid primary key default gen_random_uuid()`
- `chat_id text unique not null` (WhatsApp chat id)
- `display_name text` (tên hiển thị)
- `jira_label text not null` (label dùng query Jira; logic hiện có ở sanitizeJiraLabel)
- `status text not null default 'active'` enum gợi ý: `active | blocked`
- `created_at timestamptz not null default now()`
- `last_seen_at timestamptz`
  
### 3.2 `conversations`
  
Mục tiêu: gom request theo conversation.
  
Định nghĩa conversation (đề xuất triển khai nhanh):
- 1 conversation thuộc 1 `chat_id`
- conversation tự “mở” khi có message mới, tự “đóng” khi không có message trong X phút/giờ (vd: 6h) hoặc khi Ops bấm “Mark Resolved”.
  
Columns:
- `id uuid primary key default gen_random_uuid()`
- `chat_id text not null` (FK logic tới `clients.chat_id`)
- `title text` (auto từ message đầu hoặc từ AI)
- `status text not null default 'open'` enum gợi ý: `open | in_progress | resolved | ignored`
- `opened_at timestamptz not null default now()`
- `last_message_at timestamptz not null default now()`
- `last_message_preview text`
- `jira_parent_key text` (master ticket, nếu có)
- `jira_subtask_keys text[]` (list subtasks tạo từ conversation)
- `assigned_to text` (tên người phụ trách nội bộ, optional)
- `dedupe_group_key text` (dùng cho grouping trùng lặp, xem 3.5)
  
Index gợi ý:
- `(status, last_message_at desc)`
- `(chat_id, opened_at desc)`
  
### 3.3 `messages`
  
Mục tiêu: lưu message để hiển thị transcript/timeline.
  
- `id uuid primary key default gen_random_uuid()`
- `conversation_id uuid not null`
- `message_id text unique not null` (WhatsApp message id `_serialized`)
- `chat_id text not null`
- `sender_type text not null` enum: `client | agent` (agent = account chạy whatsapp-web)
- `sender_name text`
- `text text not null`
- `sent_at timestamptz not null`
- `created_at timestamptz not null default now()`
  
### 3.4 `automation_runs` (hoặc `events`)
  
Mục tiêu: lưu trạng thái pipeline cho mỗi message/conversation để debug + analytics.
  
- `id uuid primary key default gen_random_uuid()`
- `conversation_id uuid`
- `message_id text` (FK logic tới `messages.message_id`)
- `chat_id text not null`
- `decision text` enum: `CREATE_SUBTASK | COMMENT | IGNORE`
- `decision_reason text`
- `ai_model text`
- `jira_action text` enum: `create_parent | create_subtask | comment | none`
- `jira_issue_key text`
- `status text not null` enum: `success | skipped | failed`
- `error_type text`
- `error_message text`
- `created_at timestamptz not null default now()`
  
### 3.5 Dedupe (nhận diện request trùng lặp)
  
Triển khai nhanh nên bắt đầu bằng heuristic deterministic:
- `dedupe_key = sha256(normalize(text))`
- `normalize(text)` = lowercase + trim + collapse spaces + bỏ punctuation cơ bản.
  
Lưu vào:
- `messages.dedupe_key text` (index)
hoặc
- `conversations.dedupe_group_key text`
  
UI sẽ hiển thị “Possible duplicate” khi:
- cùng `chat_id` và có message trước đó trong N ngày có `dedupe_key` giống, hoặc
- similarity đơn giản (contains / token overlap) vượt ngưỡng (backend có thể làm sau).
  
---
  
## 4) Kiến trúc dữ liệu (triển khai nhanh)
  
### 4.1 Jira realtime + Supabase “index”
  
- Supabase lưu:
  - conversation + message + decision + mapping tới Jira keys.
  - log errors để debug.
- Jira realtime cung cấp:
  - status, assignee, priority, updatedAt của issue.
  
Triển khai nhanh cho frontend:
- UI gọi backend để lấy danh sách conversations từ Supabase.
- Với các Jira keys xuất hiện trên list, backend có thể:
  - A) Proxy fetch Jira realtime theo từng issue (đơn giản nhưng nhiều request), hoặc
  - B) Batch fetch thông tin Jira theo danh sách keys (khuyến nghị để UI mượt).
  
### 4.2 “Freshness”
  
UI nên hiển thị nhãn:
- `Live` nếu data Jira mới fetch < 60s
- `Stale` nếu > 60s (tuỳ chỉnh)
  
---
  
## 5) Contract API (Backend endpoints cho UI)
  
Đề xuất REST tối thiểu (tên path có thể đổi):
  
### 5.1 Auth
  
Nội bộ 1 team: triển khai nhanh nhất:
- Basic auth / token static (vd: `DASHBOARD_API_KEY`) hoặc
- Supabase Auth (nếu dùng).
  
UI cần:
- `GET /api/me` → thông tin user + role
  
### 5.2 Conversations (Supabase)
  
- `GET /api/conversations?status=&q=&from=&to=&assignee=&limit=&cursor=`
  - trả list conversation + summary fields + jira keys
- `GET /api/conversations/:id`
  - trả detail: conversation + messages + automation_runs + mapping Jira
- `POST /api/conversations/:id/status`
  - body: `{ status: "open|in_progress|resolved|ignored" }`
- `POST /api/conversations/:id/title`
  - body: `{ title: "..." }`
  
### 5.3 Jira (realtime proxy)
  
- `POST /api/jira/issues/batch`
  - body: `{ keys: ["OPS-1","OPS-2"] }`
  - trả: `{ issues: [{ key, summary, status, assignee, priority, updated, url }] }`
- `POST /api/jira/issues/:key/assign`
  - body: `{ accountId: "..." }`
- `POST /api/jira/issues/:key/comment`
  - body: `{ text: "..." }`
  
### 5.4 Clients
  
- `GET /api/clients?q=&status=`
- `GET /api/clients/:chatId` → detail + conversations
- `POST /api/clients/:chatId/status` → block/unblock
  
### 5.5 Analytics
  
Triển khai nhanh:
- `GET /api/analytics/overview?from=&to=`
  - counters + trend data
- `GET /api/analytics/top-causes?from=&to=&limit=`
  - top reasons/categories (từ tags hoặc từ keyword)
- `GET /api/analytics/duplicates?from=&to=&limit=`
  - list conversations bị nghi trùng
  
---

## 5.6 Phân chia trách nhiệm Frontend vs Backend

Mục tiêu: để 1 bạn frontend có thể implement đúng workflow mà không cần đọc sâu code backend; đồng thời backend có ranh giới rõ ràng về dữ liệu, logic, và tích hợp Jira.

### 5.6.1 Frontend (UI) chịu trách nhiệm

- Navigation & state UI
  - Routing: Overview / Inbox / Conversation detail / Clients / Tasks / Reports / Settings.
  - Lưu trạng thái filter/sort/pagination lên URL query để refresh/share không mất state.
  - Xử lý optimistic UI vừa đủ (ví dụ đổi status conversation), nhưng luôn reconcile theo response backend.
- Rendering & UX behavior
  - Table/list/grid, badges, empty states, loading states, error states.
  - Debounce input search, infinite scroll hoặc pagination.
  - Drawer/panel mở chi tiết, tabs, copy-to-clipboard.
  - Charts render theo dữ liệu backend trả về (UI không tự tính analytics).
- Chỉ gọi backend, không gọi Jira/Supabase trực tiếp
  - UI không cần biết token Jira/Gemini/Supabase.
  - Mọi thao tác Jira (assign/comment/fetch issues) đều gọi backend proxy API.
- Validation mức UI
  - Validate form cơ bản (required fields, max length).
  - Không tự suy luận “logic nghiệp vụ” như grouping conversation, dedupe, hay mapping Jira keys.
- Realtime/refresh
  - Polling UI (vd 15–30s) cho Inbox/Tasks nếu muốn realtime feel.
  - Respect freshness label mà backend trả về (nếu có), UI chỉ hiển thị.

### 5.6.2 Backend chịu trách nhiệm

- Database & schema (Supabase)
  - Thiết kế và migrate schema cho `clients`, `conversations`, `messages`, `automation_runs` (và optional `settings`, `audit_logs`).
  - Tạo indexes phục vụ query nhanh cho Inbox/Reports.
  - Enforce constraints (unique message_id, foreign keys logic).
- Conversation logic
  - Grouping message → conversation theo cửa sổ thời gian (vd 6h) và theo `chat_id`.
  - Update `last_message_at`, `last_message_preview`, tạo title default.
  - Lifecycle: open/in_progress/resolved/ignored; resolved_at.
- Dedupe logic
  - Tính `dedupe_key` và đánh dấu duplicate.
  - Trả về danh sách “possible duplicates” cho conversation detail.
- Integrations & secrets
  - Jira REST (realtime): search/batch fetch, issue detail, assign, comment.
  - WhatsApp ingestion: normalize message, transcript, event logs, idempotency.
  - Gemini decision: gọi model, parse/validate JSON.
  - Không lộ secrets ra UI; chỉ expose dữ liệu đã sanitize.
- API design & response shaping
  - Các endpoint phần 5, bao gồm pagination/cursor, filter, sorting.
  - Batch endpoints để tối ưu (vd `/api/jira/issues/batch`).
  - Chuẩn hoá lỗi: trả `code`, `message`, `details` để UI hiển thị rõ.
- Data joining
  - Join conversation ↔ jira keys ↔ jira status/assignee (bằng batch fetch) để UI không phải join.
  - Tính các counters/aggregations cho Overview/Reports.
- Auth nội bộ
  - Xác thực dashboard access (API key hoặc SSO nhẹ).
  - Rate-limit cơ bản để tránh UI spam Jira.

### 5.6.3 Quy ước response để frontend làm nhanh

Đề xuất mọi response list đều có format:
- `items`: array
- `next_cursor`: string|null (hoặc `page`, `total`)
- `meta`: object (optional)

Đề xuất error format thống nhất:
- `error`: `{ code, message, details? }`

Ví dụ:
- `code`: `JIRA_410_GONE`, `JIRA_AUTH_FAILED`, `GEMINI_RATE_LIMIT`, `SUPABASE_ERROR`
- `message`: string ngắn để hiển thị
- `details`: string/json đã truncate để debug

### 5.6.4 Những thứ UI tuyệt đối không làm (để tránh lệch logic)

- Không tự gọi Jira API trực tiếp từ browser.
- Không tự tính dedupe hoặc auto-group conversation ở client.
- Không tự map assignee allow-list từ env; backend phải trả danh sách chọn (nếu UI cần dropdown).
- Không tự quyết định “issue nào đại diện” cho status trên Inbox; backend trả field `primary_issue_key` (hoặc quy tắc rõ).
  
## 6) Screens & UI Elements (chi tiết)
  
### 6.1 Screen: Overview (Trang tổng quan)
  
Mục tiêu: nhìn nhanh tình hình và đi vào xử lý.
  
Elements:
- KPI Cards (row 1)
  - New conversations (Today/7d)
  - Open / In progress
  - Resolved (7d)
  - Failures (Jira/Gemini/WhatsApp)
  - Duplicate flagged
- Charts (row 2)
  - Conversations per day (bar/line)
  - Status distribution (donut)
  - Assignee workload (bar)
- “Attention Needed” list (row 3)
  - Conversations fail pipeline
  - Overdue (nếu có SLA)
  - Duplicate high-confidence
  
Actions:
- Click KPI/segment → navigate sang Inbox với filter tương ứng.

Vai trò & cách hoạt động:
- KPI Cards
  - Vai trò: cung cấp snapshot tức thời để team biết hôm nay có gì “đáng lo” và backlog ra sao.
  - Chức năng: hiển thị số liệu theo khoảng thời gian mặc định (Today và 7d), kèm so sánh với kỳ trước (optional).
  - Hành vi:
    - Click vào card → điều hướng sang Inbox với filter tương ứng (ví dụ click “Failures” → Inbox `failure=yes`).
    - Hover (optional) → tooltip mô tả cách tính.
  - Dữ liệu:
    - Nguồn chính: Supabase (`conversations`, `automation_runs`).
    - Công thức gợi ý:
      - New conversations: count `opened_at in range`.
      - Open/In progress: count `status in ('open','in_progress')`.
      - Resolved: count `status='resolved'` trong range.
      - Failures: count `automation_runs.status='failed'` trong range.
      - Duplicate: count conversations có cờ duplicate (backend tính).
- Charts
  - Vai trò: giúp nhìn xu hướng và phân bổ workload, tránh “mù số liệu”.
  - Chức năng:
    - Conversations per day: số conversation mở mới theo ngày.
    - Status distribution: tỷ trọng trạng thái hiện tại.
    - Assignee workload: số conversation/task theo assignee (internal hoặc Jira assignee).
  - Hành vi:
    - Click segment/bar → drill-down sang Inbox/Tasks với filter tương ứng.
  - Dữ liệu:
    - Supabase cho conversation metrics.
    - Nếu chart theo Jira assignee: backend có thể join từ mapping jira keys (Supabase) + batch fetch Jira (realtime) để lấy assignee hiện tại.
- “Attention Needed” list
  - Vai trò: “to-do list tự động” để Ops xử lý lỗi/điểm nóng trước.
  - Chức năng: liệt kê top N items theo ưu tiên.
  - Hành vi:
    - Mỗi item click → mở Conversation detail.
    - Có thể có quick action “Mark resolved” / “Retry sync” (optional).
  - Dữ liệu:
    - Fail pipeline: lấy từ `automation_runs.status='failed'` và group theo `conversation_id`.
    - Overdue: dựa trên `last_message_at` và SLA rule (nếu có).
    - Duplicate high-confidence: dựa trên dedupe logic.
  
### 6.2 Screen: Inbox (Conversations)
  
Đây là màn hình quan trọng nhất.
  
Layout đề xuất:
- Left: Filters panel (collapsible)
- Center: Conversations table
- Right (optional): Quick preview drawer
  
Filters:
- Status: `open | in_progress | resolved | ignored`
- Date range: `last_message_at`
- Client: search by name/chat_id
- Has Jira link: yes/no
- Assignee: internal owner hoặc Jira assignee
- Duplicate: flagged yes/no
- Failure: has error yes/no
  
Table columns (tối thiểu):
- Status badge
- Client (display_name + chat_id)
- Title (hoặc preview message)
- Last message time
- Jira (parent key + subtask count)
- Jira status (realtime)
- Jira assignee (realtime)
- Flags: `DUP`, `FAIL`, `NEW`
  
Row actions:
- Open detail
- Copy Jira link
- Mark resolved
- Assign internal owner (optional)
  
Empty states:
- Không có conversations phù hợp filter
- Không có Jira keys (chưa tạo task)

Vai trò & cách hoạt động:
- Filters panel
  - Vai trò: giúp Ops “cắt lát” workload theo đúng ngữ cảnh xử lý.
  - Chức năng: lọc theo status, thời gian, client, Jira link, assignee, duplicate, failure.
  - Hành vi:
    - Thay đổi filter → refetch list theo debounce (vd 300ms) và reset pagination.
    - Filter state nên được sync lên URL query để share/refresh không mất trạng thái.
- Conversations table
  - Vai trò: “queue” xử lý chính.
  - Chức năng: hiển thị từng conversation như một “case” kèm tín hiệu đủ để quyết định click vào hay xử lý nhanh.
  - Hành vi:
    - Sort mặc định: `last_message_at desc`.
    - Row click (hoặc nút Open) → mở Conversation detail.
    - Infinite scroll hoặc pagination (tuỳ frontend).
  - Dữ liệu:
    - Supabase: conversation metadata.
    - Jira realtime: status/assignee/priority cho các keys hiển thị (khuyến nghị backend batch).
- Status badge
  - Vai trò: trạng thái “case” do nội bộ quản lý (khác Jira status).
  - Chức năng: thể hiện vòng đời conversation `open | in_progress | resolved | ignored`.
  - Hành vi:
    - Click (optional) → quick switch status.
  - Dữ liệu:
    - Supabase `conversations.status`.
- Client column
  - Vai trò: xác định “khách là ai” và truy hồi lịch sử.
  - Chức năng: hiển thị `display_name` + `chat_id` (hoặc masked), click mở Client detail.
  - Dữ liệu: Supabase `clients`.
- Title / Preview
  - Vai trò: giúp đọc nhanh nội dung yêu cầu mà không cần vào detail.
  - Chức năng: tiêu đề (auto) hoặc message preview.
  - Hành vi:
    - Nếu chưa có title: hiển thị `last_message_preview`.
    - Nếu title trống: fallback message đầu conversation.
- Jira columns (parent/subtask/status/assignee)
  - Vai trò: nối conversation ↔ task đang được xử lý trên Jira.
  - Chức năng:
    - Parent key: link mở Jira master ticket.
    - Subtask count: số subtask đã tạo trong conversation.
    - Jira status/assignee: trạng thái realtime của parent hoặc subtask “mới nhất” (backend chọn tiêu chí).
  - Hành vi:
    - Click Jira key → mở Jira trong tab mới.
    - Hover assignee → tooltip tên đầy đủ.
  - Dữ liệu:
    - Keys: Supabase `conversations.jira_parent_key` + `jira_subtask_keys`.
    - Status/assignee: Jira realtime.
- Flags (DUP/FAIL/NEW)
  - Vai trò: hệ thống tín hiệu ưu tiên.
  - Chức năng:
    - NEW: conversation mới trong X phút.
    - FAIL: pipeline có error gần nhất.
    - DUP: bị nghi trùng lặp.
  - Hành vi:
    - Click flag → mở drawer giải thích “vì sao” (optional) hoặc filter tương ứng.
- Quick preview drawer
  - Vai trò: giảm số click; xem nhanh transcript và Jira mapping.
  - Chức năng: hiển thị last N messages + Jira cards.
  - Hành vi:
    - Mở khi hover/row select (tuỳ UX).
    - Có nút “Open full detail”.
  
### 6.3 Screen: Conversation Detail
  
Mục tiêu: xử lý một request đầy đủ, có context và thao tác nhanh.
  
Layout:
- Header
  - Client name + chatId
  - Conversation status
  - Created/last message
  - Buttons: Mark In Progress, Mark Resolved, Open in Jira (nếu có)
- Tabs (hoặc sections)
  1) Timeline
  2) Jira
  3) Automation Log
  4) Duplicates
  
Timeline (chat transcript):
- Bubble list theo thời gian
- Highlight message “trigger” (message tạo subtask/comment)
- Search within conversation
  
Jira section:
- Parent issue card (summary/status/assignee/priority + link)
- Subtasks list (key, summary, status, assignee)
- Quick actions:
  - Reassign (dropdown accountId allow-list)
  - Add comment (textarea)
  - Open in Jira
  
Automation Log:
- List automation_runs: decision + reason + status + error
- Show raw AI output (optional, gated by role)
  
Duplicates:
- “Possible duplicates” list:
  - link tới conversation trước
  - similarity score (nếu có)
  - key message preview

Vai trò & cách hoạt động:
- Header
  - Vai trò: cung cấp “case identity” và hành động chính.
  - Chức năng: hiển thị client, status, timestamps, Jira shortcuts.
  - Hành vi:
    - Mark In Progress/Resolved → gọi backend update `conversations.status`.
    - Open in Jira → mở parent key hoặc subtask key ưu tiên.
- Timeline
  - Vai trò: ngữ cảnh hội thoại để Ops hiểu đúng vấn đề.
  - Chức năng: hiển thị messages theo thời gian.
  - Hành vi:
    - Highlight trigger message: message có `automation_runs.decision != IGNORE` hoặc message tạo Jira action.
    - Search within: filter client-side hoặc server-side nếu transcript dài.
- Jira section
  - Vai trò: “control panel” để thao tác trên work items.
  - Chức năng: hiển thị issue cards và cho phép thao tác nhanh.
  - Hành vi:
    - Reassign: dropdown lấy từ allow-list (env assignee ids) và gọi backend assign endpoint.
    - Add comment: submit → backend post comment lên Jira.
    - Refresh: refetch Jira realtime cho các keys đang xem.
  - Dữ liệu:
    - Keys từ Supabase; fields realtime từ Jira.
- Automation Log
  - Vai trò: debug và audit automation.
  - Chức năng: hiển thị decision + reason + lỗi.
  - Hành vi:
    - Nếu `status=failed`, hiển thị error detail + nút “Copy error”.
    - Raw AI output chỉ bật khi cần (role admin) để tránh lộ dữ liệu nhạy cảm.
- Duplicates
  - Vai trò: tránh tạo ticket trùng, tăng chất lượng vận hành.
  - Chức năng: liệt kê case tương tự trước đó và trạng thái xử lý của chúng.
  - Hành vi:
    - Click duplicate item → mở conversation đó trong tab mới hoặc cùng layout.
  
### 6.4 Screen: Clients
  
Table columns:
- Display name
- chat_id
- last_seen_at
- #open conversations
- #resolved 30d
- status (active/blocked)
  
Client detail:
- Conversations list (filtered)
- Jira issues by label (realtime query hoặc cached)
- Notes/tags nội bộ (optional)

Vai trò & cách hoạt động:
- Clients table
  - Vai trò: danh bạ + điểm vào để nhìn toàn cảnh theo khách.
  - Chức năng: xem trạng thái hoạt động, tần suất request, và quản trị block/unblock.
  - Hành vi:
    - Click row → Client detail.
    - Toggle block/unblock (nếu có) → backend update `clients.status`.
- Jira issues by label
  - Vai trò: nhìn backlog và lịch sử công việc theo khách mà không cần search Jira thủ công.
  - Chức năng: backend query Jira theo label (sanitizeJiraLabel) và hiển thị list open/closed.
  - Hành vi:
    - Có filter open/closed.
    - Click issue → mở Jira.
  
### 6.5 Screen: Tasks (Jira Live View)
  
Mục tiêu: nhìn workload theo Jira.
  
Elements:
- Filters: status, assignee, priority, updated range, label (client)
- Table:
  - Key, Summary, Status, Assignee, Priority, Updated, Client label
- Bulk actions (optional): reassign, add comment template
  
Data:
- Backend nên gọi Jira search theo JQL (theo label hoặc theo project) rồi trả về list.

Vai trò & cách hoạt động:
- Filters
  - Vai trò: điều hướng workload theo Jira (assignee/status/priority).
  - Hành vi: thay đổi filter → gọi backend để query Jira theo JQL tương ứng.
- Tasks table
  - Vai trò: “Jira mirror” trong UI để Ops scan nhanh và chuyển ngữ cảnh.
  - Chức năng: hiển thị key/summary/status/assignee/priority/updated.
  - Hành vi:
    - Click key → mở Jira.
    - Click assignee/status (optional) → filter nhanh.
- Bulk actions (optional)
  - Vai trò: xử lý hàng loạt khi có nhiều issue cần reassign/comment.
  - Hành vi: chọn nhiều rows → action → backend thực thi lần lượt, UI hiển thị progress.
  
### 6.6 Screen: Reports
  
Triển khai nhanh nên focus vào 3 báo cáo:
  
1) Resolved summary
- Resolved count theo ngày/tuần
- Avg time-to-resolve (từ opened_at → resolved_at)
  
2) Top request categories (heuristic)
- Theo keyword mapping (backend config):
  - “billing”, “bug”, “feature”, “account”, “deployment”, “performance”, “how-to”
- Output: top categories + trend
  
3) Duplicate analysis
- Top duplicate groups (dedupe_key) + số lần lặp + clients affected

Vai trò & cách hoạt động:
- Date range selector
  - Vai trò: thống nhất “khoảng thời gian báo cáo” cho toàn trang.
  - Hành vi: đổi range → refetch toàn bộ widgets.
- Resolved summary
  - Vai trò: đo output của team.
  - Chức năng: count resolved theo thời gian và thời gian xử lý trung bình.
  - Dữ liệu: Supabase `conversations` (opened/resolved).
- Top request categories
  - Vai trò: tìm “điểm nóng” về loại vấn đề để ưu tiên cải tiến.
  - Chức năng: phân loại theo keyword mapping (phase 1), sau đó nâng cấp sang AI tagging (phase 2).
  - Dữ liệu: Supabase `messages` + mapping keywords.
- Duplicate analysis
  - Vai trò: đo mức trùng lặp và hiệu quả giảm trùng.
  - Chức năng: group theo `dedupe_key` và hiển thị top groups + các conversation liên quan.
  
### 6.7 Screen: Settings (Internal)
  
Mục tiêu: vận hành + debug.
  
Elements:
- Connection status
  - WhatsApp: ready/disconnected + last seen
  - Jira: last API success/fail
  - Gemini: last API success/fail
  - Supabase: ok/error
- Runtime toggles
  - `VIP_MODE` current value (read-only nếu bạn không muốn đổi trên UI)
  - transcript limit
  - notify enabled flags (WhatsApp/Gmail)
- Audit log (optional)

Vai trò & cách hoạt động:
- Connection status
  - Vai trò: giảm thời gian debug khi pipeline có vấn đề.
  - Chức năng: hiển thị trạng thái kết nối và lỗi gần nhất (nếu có).
  - Hành vi:
    - Refresh → ping backend health + thử Jira/Gemini minimal check (optional).
- Runtime toggles
  - Vai trò: bật/tắt các chế độ vận hành mà không cần sửa file.
  - Chức năng: hiển thị cấu hình runtime; có thể cho phép edit nếu bạn muốn.
  - Hành vi:
    - Nếu cho edit: update config → backend lưu vào Supabase `settings` hoặc env-like store, và apply runtime.
- Audit log
  - Vai trò: truy vết thay đổi và trách nhiệm nội bộ.
  - Dữ liệu: Supabase `audit_logs` (nếu implement).
  
---
  
## 7) Conversation grouping (backend logic nhanh)
  
Đề xuất thuật toán tối thiểu:
- Khi message đến:
  - tìm conversation “open” gần nhất của `chat_id` mà `last_message_at` trong cửa sổ X (vd 6h).
  - nếu có → append message vào conversation đó.
  - nếu không → tạo conversation mới.
  
Mark resolved:
- Khi Ops bấm resolved, set `status=resolved` và `resolved_at`.
- Message mới sau đó sẽ tạo conversation mới.
  
---
  
## 8) Dedupe (backend logic nhanh)
  
Mức 1 (nhanh nhất):
- dedupe_key theo normalize+hash của “message đầu conversation” hoặc “last client message”.
- duplicate nếu trong 30 ngày có conversation khác cùng chat_id có dedupe_key trùng.
  
Mức 2 (nâng cấp sau):
- similarity theo embedding (Gemini embedding hoặc local) + threshold.
  
UI cần:
- Badge “DUP” trên list
- Panel “Possible duplicates” trong detail
  
---
  
## 9) Handoff cho Frontend dev (checklist)
  
Frontend cần implement:
- Routing: Overview / Inbox / Conversation detail / Clients / Tasks / Reports / Settings
- Data fetching:
  - Supabase-backed endpoints (conversations, clients, analytics)
  - Jira realtime endpoints (batch issues + actions)
- UI primitives:
  - Table with filters + pagination
  - Drawer/detail panel
  - KPI cards + charts
  - Status badges + flag badges (FAIL/DUP/NEW)
  
Backend cần cung cấp:
- API endpoints phần 5
- Mapping Jira keys ↔ conversation/client
- Batch Jira fetch để tránh UI gọi Jira quá nhiều
  
---
  
## 10) Phạm vi tối thiểu để “go live” nội bộ (MVP)
  
MVP nên gồm:
- Inbox (conversations list + detail + mark resolved)
- Jira live cards trong detail (status/assignee/links)
- Basic overview counters
  
Analytics nâng cao (top causes, duplicates) có thể roll out sau, nhưng schema nên chuẩn bị từ đầu để không phải migrate lớn.
  
