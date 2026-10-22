# MC Thiên Ân · máy chủ thông báo

Máy chủ gửi thông báo (Web Push) cho app **MC Thiên Ân Planner**. App trên Netlify vẫn lo dữ liệu; máy chủ này chỉ hẹn giờ và gửi thông báo nhắc show, lịch họp, thu tiền tới mọi máy — kể cả khi app đang đóng.

## Cài đặt (một lần, không cần Terminal)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/hoangtourguide0507-create/mcta-push)

1. Bấm nút **Deploy to Cloudflare** ở trên.
2. Đăng nhập Cloudflare (hoặc đăng ký miễn phí bằng email).
3. Cho phép Cloudflare kết nối GitHub nếu được hỏi.
4. Giữ nguyên các tên mặc định → bấm **Create and deploy** → chờ 1–2 phút.
5. Copy địa chỉ dạng `https://mcta-push.<tên>.workers.dev` mà Cloudflare hiện ra.
6. Trên iPhone: app MC Thiên Ân → **Khác → Thông báo → Nhập địa chỉ máy chủ thông báo** → dán → **Bật thông báo trên máy này**.

Kiểm tra: mở địa chỉ ở bước 5 trên trình duyệt, thấy `{"ok":true,"ten":"MC Thiên Ân · máy chủ thông báo"}` là máy chủ đang chạy.

Gói Cloudflare Workers miễn phí là đủ dùng. Kho này chỉ chứa mã máy chủ, không chứa dữ liệu show.
