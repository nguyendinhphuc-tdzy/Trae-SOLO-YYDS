# Setup Checklist (chi tiết)

Mục tiêu: chạy được luồng **WhatsApp → Gemini → Jira**, notify về **WhatsApp nhóm nội bộ** (+ Gmail nếu bật).

## 0) Chuẩn bị repo

- Cài Node.js >= 18
- Trong thư mục dự án:

```bash
npm install
```

Tạo env:

```bash
copy .env.example .env
```

## 1) Supabase (bắt buộc)

### 1.1 Tạo project

- Vào Supabase → New project

### 1.2 Tạo bảng

- Mở SQL Editor → chạy file `supabase/schema.sql`

Schema tạo ra 2 bảng:
- `vip_clients(chat_id text primary key)`
- `event_logs(message_id text primary key)`

### 1.3 Điền VIP clients

- Trong Table Editor → `vip_clients` → Insert row
- `chat_id` = chatId của khách mà bạn muốn bot xử lý

Gợi ý: chatId khách thường dạng `xxxxxxxxxxx@c.us`

### 1.4 Lấy keys để điền `.env`

Supabase Dashboard → Project Settings → API:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 2) Jira (bắt buộc)

### 2.1 Tạo Jira API token

Atlassian account → Security → API tokens → Create token.

Điền vào `.env`:
- `JIRA_BASE_URL` (vd `https://xxx.atlassian.net`)
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- `JIRA_PROJECT_KEY`

### 2.2 Lấy accountId assignee

Bạn cần 3 accountId tương ứng với:
- `JIRA_ASSIGNEE_Phuc_ID`
- `JIRA_ASSIGNEE_Tram_ID`
- `JIRA_ASSIGNEE_Vy_ID`

Cách phổ biến: trong Jira, mở profile user hoặc gọi API `/rest/api/3/user/search?query=email` bằng curl/Postman.

## 3) Gemini (bắt buộc)

- Tạo API key Google Gemini và điền:
  - `GEMINI_API_KEY`
- `GEMINI_MODEL` có thể để trống (mặc định `gemini-1.5-flash`)

## 4) WhatsApp (bắt buộc)

### 4.1 Đăng nhập WhatsApp Web

- `WA_AUTH_PATH` (vd `.wwebjs_auth`)
- Chạy app và quét QR lần đầu

### 4.2 Lấy chatId group nội bộ để notify

- Chạy app, gửi 1 tin vào group nội bộ
- Console sẽ in:

```txt
whatsapp.group_chat_detected {"chatId":"...@g.us","name":"..."}
```

- Copy chatId vào `.env`:
  - `WA_INTERNAL_NOTIFY_CHAT_ID=...@g.us`

## 5) Gmail notify (tuỳ chọn)

Nếu không điền đủ biến sau thì hệ thống tự skip Gmail:
- `GMAIL_USER`
- `GMAIL_APP_PASSWORD` (App Password)
- `GMAIL_TO` (nhiều email cách nhau dấu phẩy)
- `GMAIL_FROM` (tuỳ chọn)

## 6) Chạy kiểm thử nhanh

```bash
npm test
```

## 7) Chạy service

```bash
npm start
```

## 8) Kịch bản test end-to-end (khuyến nghị)

1) Đảm bảo chatId khách đã nằm trong `vip_clients` (hoặc set `VIP_MODE=allow_all` để test nhanh)
2) Nhắn một yêu cầu mới từ khách
3) Kết quả mong đợi:
   - Jira có master ticket cho khách (nếu chưa có)
   - Nếu AI quyết định tạo việc mới → có subtask mới
   - Nhóm nội bộ nhận notify WhatsApp khi có subtask mới
   - Gmail nhận notify nếu bạn bật
