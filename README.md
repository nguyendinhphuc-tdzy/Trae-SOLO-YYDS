# Ops Automation (WhatsApp → Gemini → Jira)

Service tự động hoá vận hành nội bộ: nhận tin nhắn WhatsApp từ khách VIP, dùng Gemini để quyết định hành động, thực thi lên Jira (master ticket + subtask/comment), và notify về WhatsApp nhóm nội bộ + Gmail (tuỳ cấu hình).

## Yêu cầu

- Node.js >= 18
- Một máy có thể chạy WhatsApp Web (quét QR lần đầu)

## Cài đặt

```bash
npm install
```

Copy env:

```bash
copy .env.example .env
```

## Cấu hình bắt buộc (.env)

- `VIP_MODE` (tuỳ chọn): `strict` (mặc định) hoặc `allow_all` (mode test)

### WhatsApp

- `WA_AUTH_PATH` (vd: `.wwebjs_auth`)
- `WA_INTERNAL_NOTIFY_CHAT_ID` (chat id nhóm nội bộ, dạng `...@g.us`)

### Supabase

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Schema cần có:
- `vip_clients(chat_id text primary key)`
- `event_logs(message_id text primary key)`

File SQL có sẵn: [supabase/schema.sql](supabase/schema.sql)

### Gemini

- `GEMINI_API_KEY`
- `GEMINI_MODEL` (tuỳ chọn)

### Jira

- `JIRA_BASE_URL`
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- `JIRA_PROJECT_KEY`
- `JIRA_ASSIGNEE_Phuc_ID`
- `JIRA_ASSIGNEE_Tram_ID`
- `JIRA_ASSIGNEE_Vy_ID`

## Cấu hình tuỳ chọn (Gmail notify)

Nếu không điền đủ các biến sau thì Gmail notify tự tắt:

- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`
- `GMAIL_TO` (nhiều email cách nhau dấu phẩy)
- `GMAIL_FROM` (tuỳ chọn)

## Chạy

```bash
npm start
```

Mở console để quét QR WhatsApp ở lần đầu.

## Lấy chatId nhóm nội bộ

Chạy app và gửi 1 tin bất kỳ vào group nội bộ. Console sẽ in ra:

```txt
whatsapp.group_chat_detected {"chatId":"1234567890-123456789@g.us","name":"Ten Nhom"}
```

Copy `chatId` vào `WA_INTERNAL_NOTIFY_CHAT_ID`.

## Luồng xử lý

1. Ingest tin nhắn WhatsApp (bỏ qua message tự gửi).
2. Chỉ xử lý nếu chat nằm trong `vip_clients` (trừ khi `VIP_MODE=allow_all`).
3. Chống trùng message theo `event_logs.message_id`.
4. Tải ngữ cảnh Jira theo label của khách.
5. Gemini quyết định `CREATE_SUBTASK | COMMENT | IGNORE`.
6. Thực thi Jira và gửi notify nội bộ.
