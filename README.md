# MC Thiên Ân Planner

Sổ lịch show cá nhân của MC Thiên Ân. Từ V28 app chạy trên **GitHub Pages**; dữ liệu và thông báo nằm trên **máy chủ Cloudflare** riêng (thư mục `server/`). Kho này chỉ chứa mã, không chứa dữ liệu show.

- App: https://hoangtourguide0507-create.github.io/mcta-push/
- Máy chủ: Cloudflare Worker `mcta-push` (Durable Object lưu dữ liệu + hẹn giờ thông báo), mã nguồn ở `server/`.

## Mở lần đầu trên một máy
1. Mở địa chỉ app bằng **Safari** → nút Chia sẻ → **Thêm vào MH chính** → mở app từ biểu tượng mới.
2. App hỏi **mã truy cập dữ liệu** → nhập mã (giống nhau trên mọi máy).
3. Khác → Thông báo → **Bật thông báo trên máy này**.

## Chuyển dữ liệu từ Netlify (chỉ làm 1 lần)
Khác → **Máy chủ dữ liệu & thông báo** → điền mã truy cập và địa chỉ app Netlify cũ (vd. `ten-app.netlify.app`) → **Kết nối**. Dữ liệu được chép thẳng từ Netlify sang Cloudflare.

## Cập nhật app
Mỗi lần đổi `app.js` / `style.css` thì tăng `CACHE` trong `sw.js` và `?v=` trong `index.html` để điện thoại nhận bản mới.
