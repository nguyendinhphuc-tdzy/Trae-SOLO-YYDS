\# TÀI LIỆU BÀN GIAO NGỮ CẢNH (DÁN VÀO CHAT AI TIẾP THEO)



Ngày tạo: 2026-05-25  

Mục tiêu: tóm tắt \*\*toàn bộ logic dự án + các thay đổi đã làm + lịch sử trao đổi chính\*\* để AI ở phiên chat sau hiểu nhanh và tiếp tục làm việc.



\---



\## 1) Dự án này là gì?



Đây là một service “ops automation” chạy bằng Node.js:



\*\*WhatsApp (khách hàng) → AI (Gemini) quyết định → Jira (thực thi) → notify nội bộ (WhatsApp group + Gmail optional) → state/dedup trên Supabase\*\*



Đặc điểm:

\- Không có UI frontend.

\- Express chỉ có healthcheck `GET /ping`.

\- Toàn bộ nghiệp vụ chạy theo event `whatsapp-web.js` khi có tin nhắn mới.



\---



\## 2) Tech stack \& tích hợp



\- Runtime: Node.js >= 18

\- Server: Express

\- WhatsApp: `whatsapp-web.js` + `qrcode-terminal` (quét QR, lưu session local)

\- AI: Google Gemini qua `@google/generative-ai`

\- Ticketing: Jira Cloud REST API v3 (`/rest/api/3`) qua `axios`

\- DB/state: Supabase (`@supabase/supabase-js`)

\- Email: Gmail SMTP qua `nodemailer` (optional)



File tham khảo kiến trúc workflow n8n (không phải runtime chính của repo):

\- `SYSTEM\_ARCHITECTURE\_DOCUMENT\_V2.md`

\- `Beeper - n8n.json`



\---



\## 3) Cấu trúc repo (các file quan trọng)



\- Entrypoint:

&#x20; - `index.js`

\- Env validation:

&#x20; - `src/env.js`

&#x20; - `.env.example`

\- Services:

&#x20; - `src/services/whatsappIngestion.js` (ingest + transcript + VIP gate + idempotency gate + log group chatId)

&#x20; - `src/services/aiService.js` (prompt + gọi Gemini + parse/validate JSON)

&#x20; - `src/services/jiraService.js` (master ticket + subtask/comment)

&#x20; - `src/services/supabaseService.js` (vip\_clients + event\_logs)

&#x20; - `src/services/whatsappNotifyService.js` (notify WhatsApp group nội bộ)

&#x20; - `src/services/gmailService.js` (notify Gmail, optional)

&#x20; - `src/services/opsNotificationFormatter.js` (format text notify)

&#x20; - `src/services/telegramService.js` (file còn giữ nhưng LUỒNG CHÍNH đã không dùng)

\- Supabase schema (tạo bảng tối thiểu):

&#x20; - `supabase/schema.sql`

\- Docs:

&#x20; - `README.md`

&#x20; - `SETUP\_CHECKLIST.md`

\- Tests:

&#x20; - `test/\*.test.js`



\---



\## 4) Luồng nghiệp vụ chi tiết (as-implemented)



\### 4.1 Ingestion \& gating (WhatsApp)



Nguồn: `src/services/whatsappIngestion.js`



Khi có message:

1\) Bỏ qua message tự gửi (`message.fromMe`) để tránh loop.

2\) Normalize event:

&#x20;  - `messageId = message.id.\_serialized`

&#x20;  - `chatId = message.from`

&#x20;  - `text = message.body`

&#x20;  - `senderName = resolveSenderName()`

3\) Fetch transcript gần nhất để làm ngữ cảnh (default 20 messages, có clamp).

4\) VIP gate:

&#x20;  - Chỉ xử lý nếu `chatId` tồn tại trong Supabase table `vip\_clients`.

5\) Idempotency gate:

&#x20;  - Chỉ xử lý nếu `messageId` chưa từng được ghi vào Supabase table `event\_logs`.

6\) Gọi downstream handler `onEvent(event)` (trong `index.js`).



\### 4.2 Context retrieval (Jira) + AI decisioning (Gemini)



Nguồn: `index.js`, `src/services/jiraService.js`, `src/services/aiService.js`



Trong `processInboundMessage(event)`:

1\) Tạo label ổn định cho khách:

&#x20;  - Nếu `senderName` sạch và >= 3 ký tự alnum → dùng làm label

&#x20;  - Nếu không → fallback từ `chatId` (cắt 10 ký tự), ví dụ `Client1342411341`

2\) Load Jira context:

&#x20;  - Query open issues theo label và `statusCategory != Done`

&#x20;  - Convert danh sách issue thành text bullet list để tiêm vào prompt.

3\) Gọi Gemini để ra quyết định theo schema bắt buộc:

&#x20;  - `decision`: `CREATE\_SUBTASK | COMMENT | IGNORE`

&#x20;  - `reason`, `summary`, `description`

&#x20;  - `priority`: `High | Medium`

&#x20;  - `assignee\_id`: phải nằm trong allow-list từ env `JIRA\_ASSIGNEE\_\*`

4\) Parse \& validate chặt:

&#x20;  - Nếu model output không phải JSON chuẩn → strip codefence, extract object đầu tiên, parse lại.

&#x20;  - Nếu parse/validate fail → fallback `IGNORE` an toàn.



Decision rules (đang nằm trong prompt):

\- New topic không có trong EXISTING TASKS → `CREATE\_SUBTASK`

\- Follow-up đúng topic cũ → `COMMENT`

\- Không actionable → `IGNORE`



\### 4.3 Execution model (Jira)



Nguồn: `src/services/jiraService.js`



Chiến lược:

\- “Master ticket per client” theo label.

\- Nếu chưa có master ticket: tạo issue cha (default type `Task`) với summary `"{Client} - Client Master Ticket"`.

\- Nếu `COMMENT`: add comment vào master ticket, nội dung bao gồm decision payload + transcript (truncate).

\- Nếu `CREATE\_SUBTASK`: tạo subtask dưới master ticket (default type `Sub-task`) và set:

&#x20; - summary/description theo AI

&#x20; - priority nếu có

&#x20; - assignee theo `accountId`



\### 4.4 Notification (đã chỉnh)



Nguồn: `index.js`, `src/services/whatsappNotifyService.js`, `src/services/gmailService.js`, `src/services/opsNotificationFormatter.js`



Chỉ notify khi `CREATE\_SUBTASK` thành công:

\- Gửi WhatsApp message vào group nội bộ (`WA\_INTERNAL\_NOTIFY\_CHAT\_ID`)

\- Gửi Gmail (optional) nếu đủ config (nếu không đủ thì tự skip, không fail pipeline)



Nội dung notify là plain text:

\- `NEW SUBTASK CREATED`

\- Task / Assignee / Key / Link / Priority / Reason



\---



\## 5) Supabase: yêu cầu schema tối thiểu



File: `supabase/schema.sql`



Tối thiểu 2 bảng:



1\) `vip\_clients`

\- `chat\_id text primary key`

\- Dùng để whitelist chatId khách nào được bot xử lý.



2\) `event\_logs`

\- `message\_id text primary key`

\- Dùng để chống xử lý trùng 1 WhatsApp message nhiều lần.



Lưu ý:

\- Nếu `vip\_clients` không có row tương ứng → bot bỏ qua toàn bộ message từ chat đó.



\---



\## 6) Env vars (bắt buộc / optional)



Xem mẫu: `.env.example`



\### Bắt buộc (app không chạy nếu thiếu — validate tại startup)



\- `SUPABASE\_URL`

\- `SUPABASE\_SERVICE\_ROLE\_KEY`

\- `WA\_AUTH\_PATH`

\- `GEMINI\_API\_KEY`

\- `JIRA\_BASE\_URL`

\- `JIRA\_EMAIL`

\- `JIRA\_API\_TOKEN`

\- `JIRA\_PROJECT\_KEY`

\- `JIRA\_ASSIGNEE\_DANI\_ID`

\- `JIRA\_ASSIGNEE\_SAM\_ID`

\- `JIRA\_ASSIGNEE\_JAY\_ID`



\### Bắt buộc để notify WhatsApp nội bộ (nếu muốn nhận notify)



\- `WA\_INTERNAL\_NOTIFY\_CHAT\_ID` (dạng `...@g.us`)



\### Optional (Gmail notify)



Chỉ bật khi đủ cả 3:

\- `GMAIL\_USER`

\- `GMAIL\_APP\_PASSWORD`

\- `GMAIL\_TO` (csv)



`GMAIL\_FROM` là tuỳ chọn.



\---



\## 7) Cách lấy chatId group WhatsApp nội bộ (đã code sẵn)



Trong `whatsappIngestion.js` có log tự động khi phát hiện message trong group (chỉ log 1 lần cho mỗi group):



Log dạng:

`whatsapp.group\_chat\_detected {"chatId":"12345-67890@g.us","name":"Ten Nhom"}`



Sau đó lấy `chatId` điền vào `.env`:

`WA\_INTERNAL\_NOTIFY\_CHAT\_ID=12345-67890@g.us`



\---



\## 8) Git/Commit history (trong repo hiện tại)



Repo có 3 commits:

\- `9d82b70` Initial commit: WhatsApp-Gemini-Jira ops automation

\- `b14f73c` docs: add setup README

\- `c943653` docs: add detailed setup checklist



\---



\## 9) Lịch sử trao đổi (tóm tắt những gì đã làm/đã quyết định)



1\) User yêu cầu đọc toàn bộ dự án và tóm tắt → đã tóm tắt: pipeline WhatsApp → Gemini → Jira; Supabase cho VIP + idempotency; ban đầu notify Telegram.

2\) User yêu cầu:

&#x20;  - Tóm tắt sâu theo nghiệp vụ vận hành nội bộ

&#x20;  - Sửa notify: bỏ Telegram, chuyển sang WhatsApp group nội bộ + Gmail (nếu được)

3\) Đã thực hiện chỉnh code:

&#x20;  - Thêm WhatsApp notifier + Gmail notifier

&#x20;  - Thêm formatter thông báo plain text

&#x20;  - Bỏ yêu cầu env TELEGRAM\_\* (không còn validate bắt buộc)

&#x20;  - Thêm log lấy group chatId

&#x20;  - Thêm `.gitignore` để tránh commit `.env` và `.wwebjs\_auth`

&#x20;  - Thêm `supabase/schema.sql`

&#x20;  - Thêm docs README + setup checklist + tests, chạy `npm test` pass

4\) User chạy `npm start` gặp lỗi `Missing required environment variables ...`:

&#x20;  - Nguyên nhân: thiếu `.env` đầy đủ (SUPABASE/JIRA/GEMINI/WA).

5\) User đổi tên thư mục dự án:

&#x20;  - Repo hiện nằm tại: `C:\\Users\\PC\\Downloads\\Trae SOLO YYDS`



\---



\## 10) Next actions để chạy được end-to-end



1\) Tạo `.env` từ `.env.example` và điền đủ biến bắt buộc.

2\) Supabase:

&#x20;  - Tạo project

&#x20;  - Chạy `supabase/schema.sql`

&#x20;  - Insert ít nhất 1 row vào `vip\_clients`

3\) Jira:

&#x20;  - Tạo API token

&#x20;  - Điền base URL/email/token/project key

&#x20;  - Lấy `accountId` cho 3 assignees

4\) Gemini:

&#x20;  - Tạo `GEMINI\_API\_KEY`

5\) WhatsApp:

&#x20;  - `npm start` để quét QR

&#x20;  - nhắn 1 tin vào group nội bộ để lấy `WA\_INTERNAL\_NOTIFY\_CHAT\_ID`

6\) Test:

&#x20;  - `npm test`

&#x20;  - `npm start` và nhắn từ VIP chat để xem Jira và notify nội bộ.

