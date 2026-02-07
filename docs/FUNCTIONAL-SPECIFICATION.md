# Tài liệu Đặc tả Chức năng (Functional Specification)
# AI Product Manager MVP

> Phiên bản: 1.0
> Cập nhật: 2026-02-07

---

## Mục lục

1. [Giới thiệu sản phẩm](#1-giới-thiệu-sản-phẩm)
2. [Người dùng và Phân quyền](#2-người-dùng-và-phân-quyền)
3. [Module: Đăng ký & Đăng nhập](#3-module-đăng-ký--đăng-nhập)
4. [Module: Quản lý Tổ chức](#4-module-quản-lý-tổ-chức)
5. [Module: Quản lý Task](#5-module-quản-lý-task)
6. [Module: AI Orchestration](#6-module-ai-orchestration)
7. [Module: Document Review & Approval](#7-module-document-review--approval)
8. [Module: Export & Publish](#8-module-export--publish)
9. [Module: AI Provider Settings](#9-module-ai-provider-settings)
10. [Module: Budget Management](#10-module-budget-management)
11. [Module: Decision Log](#11-module-decision-log)
12. [Module: Audit Log](#12-module-audit-log)
13. [Module: Dashboard](#13-module-dashboard)
14. [Phụ lục: Trạng thái Task](#phụ-lục-trạng-thái-task)

---

## 1. Giới thiệu sản phẩm

### 1.1 Mục đích
AI Product Manager (AI-PM) là ứng dụng web giúp chuyển đổi yêu cầu từ stakeholders thành Product Brief có cấu trúc, thông qua quy trình kiểm soát với sự phối hợp của nhiều AI (OpenAI, Claude, Gemini).

### 1.2 Vấn đề giải quyết
- Stakeholder đưa yêu cầu mơ hồ, thiếu chi tiết
- PM mất thời gian làm rõ và viết brief
- Thiếu truy xuất nguồn gốc thông tin
- Không có quy trình review chuẩn

### 1.3 Giải pháp
- Wizard hướng dẫn làm rõ yêu cầu (Clarification)
- Cho phép đính kèm nguồn tham khảo (Context)
- AI tự động sinh brief với multi-step validation
- Quy trình review & approve trước khi publish

### 1.4 Nguyên tắc thiết kế
| Nguyên tắc | Mô tả |
|------------|-------|
| Evidence-first | Không bịa thông tin; thiếu gì phải đánh dấu |
| Approve-to-publish | Output cần user approve trước khi publish |
| Traceability | Lưu trace đầy đủ (prompts, outputs, costs) |
| Multi-tenant | Dữ liệu cách ly theo Organization |

---

## 2. Người dùng và Phân quyền

### 2.1 Vai trò (Roles)

| Vai trò | Mô tả | Quyền hạn |
|---------|-------|-----------|
| **Organization Admin** | Quản trị viên tổ chức | Toàn quyền trong org |
| **Organization Member** | Thành viên tổ chức | Xem, tạo, sửa tasks của mình |

### 2.2 Ma trận phân quyền

| Chức năng | Admin | Member |
|-----------|:-----:|:------:|
| Xem Dashboard | ✅ | ✅ |
| Tạo/Sửa/Xóa Task | ✅ | ✅ (của mình) |
| Chạy AI Generation | ✅ | ✅ |
| Approve Document | ✅ | ✅ |
| Export/Publish | ✅ | ✅ |
| Xem Decision Log | ✅ | ✅ |
| Tạo Decision | ✅ | ✅ |
| Mời thành viên | ✅ | ❌ |
| Xóa thành viên | ✅ | ❌ |
| Cấu hình AI Provider | ✅ | ❌ |
| Cài đặt Budget | ✅ | ❌ |
| Xem Audit Log | ✅ | ❌ |
| Cập nhật cài đặt Org | ✅ | ❌ |

---

## 3. Module: Đăng ký & Đăng nhập

### 3.1 Đăng ký (Sign Up)

**Mô tả:** Người dùng mới tạo tài khoản và tùy chọn tạo Organization.

**Luồng chính:**
1. User truy cập trang Đăng ký
2. Nhập thông tin: Email, Password, Tên
3. (Tùy chọn) Nhập tên Organization nếu muốn tạo org mới
4. Nhấn "Đăng ký"
5. Hệ thống gửi email xác thực (có hiệu lực 24 giờ)
6. User click link trong email để xác thực
7. Chuyển đến trang Đăng nhập

**Quy tắc nghiệp vụ:**
- Email phải unique trong hệ thống
- Password tối thiểu 8 ký tự, có chữ hoa, chữ thường, số
- Nếu tạo org: User tự động trở thành Admin của org đó
- Email chưa xác thực → không thể đăng nhập

**Trường nhập liệu:**
| Trường | Bắt buộc | Validation |
|--------|:--------:|------------|
| Email | ✅ | Format email hợp lệ |
| Password | ✅ | Min 8 ký tự, có uppercase, lowercase, số |
| Họ tên | ✅ | Min 2 ký tự |
| Tên Organization | ❌ | Min 2 ký tự nếu có |

---

### 3.2 Đăng nhập (Login)

**Mô tả:** User đã có tài khoản đăng nhập vào hệ thống.

**Luồng chính:**
1. User nhập Email và Password
2. Nhấn "Đăng nhập"
3. Hệ thống xác thực thông tin
4. Nếu thành công: Chuyển đến Dashboard
5. Nếu thất bại: Hiển thị lỗi

**Quy tắc nghiệp vụ:**
- Email chưa xác thực → Báo lỗi, yêu cầu xác thực email
- Sai password 5 lần → Khóa tạm 15 phút
- Session timeout: Access token 15 phút, Refresh token 30 ngày

**Thông báo lỗi:**
| Trường hợp | Thông báo |
|------------|-----------|
| Sai email/password | "Email hoặc mật khẩu không đúng" |
| Email chưa xác thực | "Vui lòng xác thực email trước khi đăng nhập" |
| Tài khoản bị khóa | "Tài khoản đã bị tạm khóa. Vui lòng thử lại sau 15 phút" |

---

### 3.3 Quên mật khẩu

**Luồng chính:**
1. User nhấn "Quên mật khẩu" ở trang Login
2. Nhập email
3. Hệ thống gửi link reset (có hiệu lực 1 giờ)
4. User click link, nhập mật khẩu mới
5. Hệ thống cập nhật và logout tất cả sessions

---

### 3.4 Chấp nhận lời mời

**Mô tả:** User được mời vào Organization.

**Luồng chính (User chưa có tài khoản):**
1. User nhận email mời, click link
2. Hiển thị form tạo tài khoản với email đã điền sẵn
3. User nhập password và họ tên
4. Hệ thống tạo account + thêm vào org
5. Chuyển đến Dashboard của org

**Luồng chính (User đã có tài khoản):**
1. User nhận email mời, click link
2. Nếu đã đăng nhập: Tự động thêm vào org
3. Nếu chưa đăng nhập: Yêu cầu đăng nhập trước

**Quy tắc nghiệp vụ:**
- Link mời hết hạn sau 72 giờ
- Mỗi email chỉ có 1 lời mời pending cho 1 org

---

## 4. Module: Quản lý Tổ chức

### 4.1 Thông tin Organization

**Mô tả:** Admin xem và cập nhật thông tin org.

**Thông tin hiển thị:**
- Tên Organization
- Slug (URL identifier)
- Timezone
- Ngôn ngữ mặc định
- Allowed email domains (optional)

**Chức năng:**
- Cập nhật tên, timezone, ngôn ngữ
- Cập nhật allowed email domains

---

### 4.2 Quản lý thành viên

**Mô tả:** Admin quản lý thành viên trong org.

**Danh sách thành viên hiển thị:**
| Cột | Mô tả |
|-----|-------|
| Tên | Họ tên thành viên |
| Email | Email |
| Vai trò | Admin / Member |
| Trạng thái | Active / Suspended |
| Ngày tham gia | Ngày join org |

**Chức năng:**
| Hành động | Mô tả | Điều kiện |
|-----------|-------|-----------|
| Đổi vai trò | Chuyển Admin ↔ Member | Không thể tự đổi vai trò mình |
| Tạm khóa | Suspend member | Không thể tự suspend mình |
| Xóa | Xóa khỏi org | Phải có ít nhất 1 Admin còn lại |

---

### 4.3 Mời thành viên

**Mô tả:** Admin mời người mới vào org.

**Luồng chính:**
1. Admin nhấn "Mời thành viên"
2. Nhập danh sách email (có thể nhiều email, phân cách bằng dấu phẩy)
3. Chọn vai trò: Admin hoặc Member
4. Nhấn "Gửi lời mời"
5. Hệ thống gửi email cho từng người

**Quản lý lời mời:**
- Xem danh sách lời mời đang pending
- Hủy lời mời chưa được accept

**Quy tắc nghiệp vụ:**
- Nếu org có allowed_email_domains: Chỉ chấp nhận email thuộc domain đó
- Không gửi lời mời cho email đã là thành viên
- Lời mời hết hạn sau 72 giờ

---

## 5. Module: Quản lý Task

### 5.1 Danh sách Task

**Mô tả:** Hiển thị tất cả tasks trong org.

**Bộ lọc:**
| Filter | Mô tả |
|--------|-------|
| Trạng thái | NEW, CLARIFYING, READY, DRAFT, IN_REVIEW, APPROVED, etc. |
| Owner | Người tạo task |
| Workflow | Loại workflow |
| Tìm kiếm | Tìm theo title hoặc request text |

**Cột hiển thị:**
| Cột | Mô tả |
|-----|-------|
| Title | Tiêu đề task |
| Status | Trạng thái hiện tại |
| Owner | Người tạo |
| Workflow | Loại workflow |
| Created | Ngày tạo |
| Updated | Ngày cập nhật |

**Hành động:**
- Click vào row → Xem chi tiết
- Nút "Tạo Task mới"

---

### 5.2 Tạo Task mới

**Mô tả:** User tạo task mới để bắt đầu quy trình.

**Luồng chính:**
1. User nhấn "Tạo Task mới"
2. Chọn Workflow (ví dụ: Product Brief, Feature Spec, etc.)
3. Nhập tiêu đề
4. Nhập yêu cầu ban đầu (request text)
5. Nhấn "Tạo"
6. Hệ thống tạo task với trạng thái NEW
7. Chuyển đến trang chi tiết task

**Trường nhập liệu:**
| Trường | Bắt buộc | Validation |
|--------|:--------:|------------|
| Workflow | ✅ | Chọn từ danh sách |
| Title | ✅ | Min 5 ký tự, max 200 |
| Request Text | ✅ | Min 20 ký tự |

---

### 5.3 Chi tiết Task

**Mô tả:** Xem và thao tác với task.

**Các tab:**

#### Tab 1: Overview
- Thông tin cơ bản (title, status, owner, dates)
- Request text ban đầu
- **Clarifications** - Danh sách Q&A làm rõ yêu cầu
- **Context Items** - Nguồn tham khảo đính kèm
- **AI Recommendations** - Gợi ý từ AI về độ sẵn sàng

#### Tab 2: Document
- Xem nội dung brief được AI generate
- Các version của document
- Nút Approve / Reject
- Nút Export / Publish

#### Tab 3: Runs
- Lịch sử các lần chạy AI
- Chi tiết từng stage (Generator, Critic, Cross-Questioner, Synthesizer)
- Thông tin tokens và cost

---

### 5.4 Clarification (Làm rõ yêu cầu)

**Mô tả:** User bổ sung thông tin làm rõ yêu cầu ban đầu.

**Cách thức:**
1. Xem danh sách câu hỏi gợi ý từ hệ thống
2. Với mỗi câu hỏi, user nhập câu trả lời
3. User có thể thêm Q&A tùy ý

**Cấu trúc Clarification:**
```
- Question: "Đối tượng người dùng mục tiêu là ai?"
  Answer: "Doanh nghiệp vừa và nhỏ, từ 10-100 nhân viên"

- Question: "Deadline dự kiến?"
  Answer: "Q2 2026"
```

---

### 5.5 Context Items (Nguồn tham khảo)

**Mô tả:** User đính kèm các nguồn thông tin liên quan.

**Loại Context Items:**
| Loại | Mô tả | Ví dụ |
|------|-------|-------|
| Link | URL trang web | Link Confluence, Google Docs |
| Text | Nội dung text tự nhập | Ghi chú từ meeting |
| Decision | Link đến Decision trong hệ thống | Quyết định liên quan |

**Thao tác:**
- Thêm context item mới
- Sửa context item
- Xóa context item

---

### 5.6 AI Recommendations

**Mô tả:** AI phân tích task và đưa ra gợi ý.

**Thông tin hiển thị:**
| Thành phần | Mô tả |
|------------|-------|
| Readiness Score | Điểm sẵn sàng 0-100% |
| Summary | Tóm tắt tình trạng |
| Recommendations | Danh sách gợi ý cụ thể |

**Loại Recommendations:**
| Loại | Mô tả | Ví dụ |
|------|-------|-------|
| Clarification | Cần làm rõ thêm | "Cần xác định rõ budget" |
| Context | Cần thêm nguồn | "Nên đính kèm research data" |
| Action | Hành động tiếp theo | "Có thể bắt đầu generate" |
| Warning | Cảnh báo | "Thiếu thông tin về timeline" |

**Điều kiện hiển thị:**
- Chỉ hiển thị khi task ở trạng thái CLARIFYING hoặc READY_FOR_GENERATION

---

## 6. Module: AI Orchestration

### 6.1 Mô tả

Hệ thống sử dụng nhiều AI model để tạo Product Brief qua 4 bước:

| Bước | Vai trò | AI Model | Nhiệm vụ |
|------|---------|----------|----------|
| 1 | Generator | OpenAI GPT-4.1 | Tạo draft brief đầu tiên |
| 2 | Critic | Claude 3.5 Sonnet | Phê bình, tìm lỗi |
| 3 | Cross-Questioner | Gemini 1.5 Pro | Đặt câu hỏi bổ sung |
| 4 | Synthesizer | OpenAI GPT-4.1 | Tổng hợp thành brief cuối |

### 6.2 Chạy Generation

**Điều kiện tiên quyết:**
- Task phải ở trạng thái READY_FOR_GENERATION
- Org phải có ít nhất 1 AI Provider được cấu hình
- Budget chưa vượt hard limit

**Luồng chính:**
1. User nhấn nút "Generate Brief"
2. Hệ thống kiểm tra điều kiện
3. Tạo Run mới, đưa vào queue
4. Worker xử lý tuần tự 4 stages
5. Mỗi stage output được validate JSON schema
6. Nếu thành công: Tạo Document, chuyển task sang DRAFT_GENERATED
7. Nếu thất bại: Chuyển task sang FAILED

**Xử lý lỗi:**
| Lỗi | Xử lý |
|-----|-------|
| Provider không available | Fallback sang provider khác |
| Vượt budget | Dừng và thông báo |
| Output không đúng schema | Retry tối đa 3 lần |
| Timeout | Đánh dấu FAILED |

### 6.3 Xem Run History

**Thông tin hiển thị cho mỗi Run:**
- ID và thời gian
- Trạng thái: QUEUED, RUNNING, SUCCEEDED, FAILED
- Tổng thời gian chạy
- Tổng tokens và cost

**Chi tiết từng Stage:**
| Thông tin | Mô tả |
|-----------|-------|
| Role | Generator, Critic, etc. |
| Provider | openai, anthropic, google |
| Model | gpt-4.1, claude-3.5-sonnet, etc. |
| Input Tokens | Số tokens đầu vào |
| Output Tokens | Số tokens đầu ra |
| Cost | Chi phí (cents) |
| Status | PENDING, RUNNING, SUCCEEDED, FAILED |
| Output | JSON output (expand để xem) |

---

## 7. Module: Document Review & Approval

### 7.1 Xem Document

**Mô tả:** Xem Product Brief được AI generate.

**Cấu trúc Brief:**
| Section | Mô tả |
|---------|-------|
| Executive Summary | Tóm tắt tổng quan |
| Problem Statement | Vấn đề cần giải quyết |
| Proposed Solution | Giải pháp đề xuất |
| Target Users | Đối tượng người dùng |
| Key Features | Tính năng chính |
| Success Metrics | Tiêu chí thành công |
| Timeline | Lộ trình dự kiến |
| Risks & Mitigations | Rủi ro và giải pháp |
| Open Questions | Câu hỏi còn mở |
| Needs Validation | Thông tin cần xác nhận |

### 7.2 Approve Document

**Mô tả:** User phê duyệt brief.

**Luồng chính:**
1. User xem xét nội dung brief
2. Nhấn "Approve"
3. Hệ thống:
   - Đánh dấu document là approved
   - Cập nhật task sang trạng thái APPROVED
   - Ghi audit log

**Điều kiện:**
- Task phải ở DRAFT_GENERATED hoặc IN_REVIEW
- User phải là member của org

### 7.3 Reject Document

**Mô tả:** User từ chối brief, yêu cầu generate lại.

**Luồng chính:**
1. User nhấn "Reject"
2. (Optional) Nhập lý do reject
3. Hệ thống chuyển task về READY_FOR_GENERATION
4. User có thể sửa clarifications/context rồi generate lại

---

## 8. Module: Export & Publish

### 8.1 Export Document

**Mô tả:** Xuất document ra file.

**Định dạng hỗ trợ:**
| Format | Mô tả |
|--------|-------|
| Markdown | File .md |
| PDF | In qua browser |
| JSON | Raw data |

**Luồng Export PDF:**
1. User nhấn "Export PDF"
2. Hệ thống generate HTML với styling
3. Mở cửa sổ print của browser
4. User chọn "Save as PDF"

### 8.2 Publish Document

**Mô tả:** Đẩy document lên platform khác.

**Platforms hỗ trợ:**
| Platform | Trạng thái | Mô tả |
|----------|------------|-------|
| Webhook | ✅ Hoạt động | POST JSON đến URL tùy chọn |
| Confluence | 🔜 Sắp có | Tạo/cập nhật page |
| Notion | 🔜 Sắp có | Tạo database entry |

**Luồng Publish Webhook:**
1. User nhấn "Publish"
2. Chọn platform "Webhook"
3. Nhập Webhook URL
4. Nhấn "Publish"
5. Hệ thống POST document JSON đến URL
6. Hiển thị kết quả (success/fail)

**Cấu trúc Webhook Payload:**
```json
{
  "task_id": "uuid",
  "document_id": "uuid",
  "title": "Product Brief Title",
  "content": { ... },
  "approved_by": "user@email.com",
  "approved_at": "2026-02-07T10:00:00Z",
  "published_at": "2026-02-07T10:05:00Z"
}
```

---

## 9. Module: AI Provider Settings

### 9.1 Mô tả

Admin cấu hình các AI providers để sử dụng cho orchestration.

**Providers hỗ trợ:**
| Provider | Models |
|----------|--------|
| OpenAI | gpt-4.1, gpt-4o, gpt-3.5-turbo |
| Anthropic | claude-3.5-sonnet, claude-3-opus |
| Google | gemini-1.5-pro, gemini-1.5-flash |

### 9.2 Chế độ sử dụng

| Chế độ | Mô tả |
|--------|-------|
| BYOK (Bring Your Own Key) | User nhập API key của mình |
| Managed | Sử dụng key của platform (nếu có) |

### 9.3 Cấu hình Provider

**Luồng chính:**
1. Admin vào Settings > AI Providers
2. Chọn provider muốn cấu hình
3. Chọn chế độ: BYOK hoặc Managed
4. Nếu BYOK: Nhập API key
5. Chọn default model
6. Chọn allowed models (optional)
7. Nhấn "Save"

**Bảo mật API Key:**
- Key được mã hóa AES-256-GCM trước khi lưu
- Chỉ hiển thị 4 ký tự cuối
- Không bao giờ trả về key qua API

---

## 10. Module: Budget Management

### 10.1 Mô tả

Admin đặt giới hạn chi tiêu để kiểm soát cost AI.

### 10.2 Loại Budget

| Loại | Mô tả |
|------|-------|
| Daily | Reset mỗi ngày 00:00 UTC |
| Monthly | Reset ngày 1 mỗi tháng |

### 10.3 Loại Limit

| Loại | Mô tả | Hành động khi vượt |
|------|-------|-------------------|
| Soft Limit | Cảnh báo | Hiển thị warning, vẫn cho chạy |
| Hard Limit | Chặn | Không cho chạy generation |

### 10.4 Cấu hình Budget

**Luồng chính:**
1. Admin vào Settings > Budget
2. Nhập Soft Limit (USD)
3. Nhập Hard Limit (USD)
4. Chọn kỳ: Daily hoặc Monthly
5. Nhấn "Save"

### 10.5 Xem Usage

**Thông tin hiển thị:**
| Metric | Mô tả |
|--------|-------|
| Current Spend | Chi tiêu hiện tại trong kỳ |
| Soft Limit | Ngưỡng cảnh báo |
| Hard Limit | Ngưỡng chặn |
| % Used | Phần trăm đã dùng |
| By Provider | Breakdown theo provider |

---

## 11. Module: Decision Log

### 11.1 Mô tả

Lưu trữ các quyết định quan trọng trong dự án để tham khảo.

### 11.2 Danh sách Decisions

**Cột hiển thị:**
| Cột | Mô tả |
|-----|-------|
| Summary | Tóm tắt quyết định |
| Owner | Người quyết định |
| Date | Ngày quyết định |
| Tags | Nhãn phân loại |

**Bộ lọc:**
- Tìm kiếm theo summary
- Filter theo tag

### 11.3 Tạo Decision

**Trường nhập liệu:**
| Trường | Bắt buộc | Mô tả |
|--------|:--------:|-------|
| Summary | ✅ | Tóm tắt ngắn gọn |
| Rationale | ✅ | Lý do đưa ra quyết định |
| Owner | ✅ | Người chịu trách nhiệm |
| Decided Date | ✅ | Ngày quyết định |
| Links | ❌ | URLs liên quan |
| Tags | ❌ | Nhãn phân loại |

### 11.4 Liên kết với Task

- Khi thêm Context Item cho Task, có thể chọn link đến Decision
- Giúp trace nguồn gốc thông tin trong brief

---

## 12. Module: Audit Log

### 12.1 Mô tả

Ghi lại tất cả hành động quan trọng trong hệ thống để audit.

**Chỉ Admin mới xem được Audit Log.**

### 12.2 Các hành động được ghi

| Nhóm | Hành động |
|------|-----------|
| User | Login, Logout, Signup, Password Reset |
| Organization | Created, Updated, Member Invited, Member Removed, Role Changed |
| Task | Created, Updated, Deleted, Status Changed |
| Document | Generated, Approved, Rejected, Exported |
| Run | Started, Completed, Failed, Cancelled |
| Provider | Configured, Key Updated |
| Budget | Updated |
| Decision | Created, Updated, Deleted |

### 12.3 Xem Audit Log

**Cột hiển thị:**
| Cột | Mô tả |
|-----|-------|
| Timestamp | Thời điểm xảy ra |
| Action | Loại hành động |
| Actor | Người thực hiện |
| Target | Đối tượng bị tác động |
| IP Address | Địa chỉ IP |
| Details | Chi tiết bổ sung |

**Bộ lọc:**
- Khoảng thời gian (from - to)
- Loại action
- Actor (người thực hiện)

---

## 13. Module: Dashboard

### 13.1 Mô tả

Trang tổng quan hiển thị metrics quan trọng của org.

### 13.2 Các thành phần

#### Tasks Overview
| Metric | Mô tả |
|--------|-------|
| Total Tasks | Tổng số tasks |
| By Status | Breakdown theo trạng thái |
| My Tasks | Tasks của user hiện tại |

#### Usage Stats (kỳ hiện tại)
| Metric | Mô tả |
|--------|-------|
| Total Cost | Tổng chi phí |
| Total Tokens | Tổng tokens đã dùng |
| By Provider | Breakdown theo provider |

#### Budget Status
| Metric | Mô tả |
|--------|-------|
| Current Spend | Chi tiêu hiện tại |
| Soft Limit | Ngưỡng cảnh báo |
| Hard Limit | Ngưỡng chặn |
| Progress Bar | Thanh tiến trình trực quan |

#### Recent Runs
- 5 runs gần nhất
- Hiển thị: Task title, Status, Duration, Cost

---

## Phụ lục: Trạng thái Task

### State Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│    ┌─────┐                                                  │
│    │ NEW │                                                  │
│    └──┬──┘                                                  │
│       │                                                     │
│       ▼                                                     │
│  ┌──────────┐                                               │
│  │CLARIFYING│◄─────────────────────────────────────┐        │
│  └────┬─────┘                                      │        │
│       │                                            │        │
│       ▼                                            │        │
│  ┌─────────────────────┐     ┌────────┐           │        │
│  │READY_FOR_GENERATION │◄────│ FAILED │           │        │
│  └──────────┬──────────┘     └────────┘           │        │
│             │                                      │        │
│             ▼                                      │        │
│    ┌────────────────┐                              │        │
│    │DRAFT_GENERATED │                              │        │
│    └───────┬────────┘                              │        │
│            │                                       │        │
│            ▼                                       │        │
│      ┌───────────┐                                 │        │
│      │ IN_REVIEW │─────────────────────────────────┘        │
│      └─────┬─────┘         (reject)                         │
│            │                                                │
│            ▼ (approve)                                      │
│       ┌──────────┐                                          │
│       │ APPROVED │                                          │
│       └────┬─────┘                                          │
│            │                                                │
│       ┌────┴────┐                                           │
│       ▼         ▼                                           │
│  ┌──────────┐ ┌───────────┐                                 │
│  │ EXPORTED │ │ PUBLISHED │                                 │
│  └──────────┘ └───────────┘                                 │
│                                                             │
│  * Từ bất kỳ trạng thái nào cũng có thể chuyển sang ON_HOLD │
│  * Từ ON_HOLD có thể quay về CLARIFYING hoặc READY          │
└─────────────────────────────────────────────────────────────┘
```

### Mô tả các trạng thái

| Trạng thái | Mô tả | Hành động tiếp theo |
|------------|-------|---------------------|
| NEW | Vừa tạo | Bắt đầu clarify |
| CLARIFYING | Đang làm rõ yêu cầu | Thêm clarifications, context |
| READY_FOR_GENERATION | Sẵn sàng generate | Nhấn Generate |
| DRAFT_GENERATED | Đã có draft | Review document |
| IN_REVIEW | Đang review | Approve hoặc Reject |
| APPROVED | Đã phê duyệt | Export hoặc Publish |
| EXPORTED | Đã xuất file | - |
| PUBLISHED | Đã publish | - |
| FAILED | Generation thất bại | Retry hoặc Hold |
| ON_HOLD | Tạm dừng | Resume khi sẵn sàng |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-07 | Initial release |

---

*Tài liệu này được cập nhật bởi AI Product Manager Team.*
