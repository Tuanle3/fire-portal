# LOG TIẾN ĐỘ — Module Dòng tiền (fire-portal)

> File này ghi lại toàn bộ quyết định + việc đã làm/chưa làm của module
> "Test Dòng tiền" (`app/(authenticated)/test-dong-tien/`). Khi mở phiên
> Claude mới, đính kèm file này để AI nắm lại ngay, không cần giải thích lại.
>
> Cập nhật lần cuối: xem mục "Trạng thái hiện tại" cuối file.

---

## 1. MỤC TIÊU BAN ĐẦU (đại ca yêu cầu)

1. Hạn mức tín dụng đã theo dõi + nhập liệu tự động (module có sẵn).
2. CP hoạt động + thanh toán khác lấy từ Firebase RTDB (`data_quy`, đồng bộ
   từ Google Sheet) — vì Sheet có theo dõi trả lãi + gốc vay → tính tồn quỹ cuối.
3. Xem kế hoạch dòng tiền còn lại theo đúng ngày/tuần/tháng, đối chiếu
   thanh toán tới đâu.
4. Xem tình trạng thiếu hụt theo tuần — **cảnh báo ngay khi thiếu, không
   dùng ngưỡng số tiền cố định** (đã chốt).

---

## 2. KIẾN TRÚC 3 NGUỒN DÒNG TIỀN (đã chốt)

| Nguồn | File | Vai trò | Vào tổng dòng tiền chính? |
|---|---|---|---|
| Nhập tay | `dong-tien-store.ts` | CP linh hoạt, thu khác gõ tay | ✅ |
| Hạn mức tín dụng | `dong-tien-hanmuc-adapter.ts` (có sẵn) | Lịch trả nợ/giải ngân theo hợp đồng | ✅ |
| Sổ quỹ thật (`data_quy`) — **KHÔNG khớp mã vay** | `dong-tien-quy-adapter.ts` (MỚI, đang viết) | CP hoạt động thực tế (CP-BH, CP-HC, CP-TK, CP-MAR, CP-Bank, THU-KD...) | ✅ |
| Sổ quỹ thật (`data_quy`) — **CÓ khớp mã vay** | (cùng file trên) | Đối chiếu chéo với lịch trả nợ hạn mức | ❌ chỉ hiển thị bảng đối chiếu riêng (Phần 5) |

**Nguyên tắc chống trùng:** dòng nào trên Sheet có Mã ngân sách khớp pattern
vay ngân hàng → KHÔNG cộng vào tổng dòng tiền chính (đã có từ module Hạn
mức tín dụng, chính xác hơn vì theo từng hợp đồng) — chỉ dùng để đối chiếu.

**Cột `Loại`** trên Sheet: tạm thời chỉ lấy `Loại === 'Thực tế'` (đại ca
chốt — sau này đổi tính sau).
**Cột `Status`**: bỏ qua, chưa dùng.

Tồn quỹ cuối kỳ: dùng TOÀN BỘ `data_quy` (kể cả dòng vay) để tính số dư
`Tồn` thật per tài khoản — tách biệt hoàn toàn với việc lọc trùng ở trên.

---

## 3. MÃ NGÂN SÁCH — công thức đối chiếu (đã chốt, xem `lib/ma-ngan-sach.ts`)

### Nhánh A — Doanh nghiệp (SAP/SAHS/ĐTSA/YANA/Sao Việt) vay trực tiếp NH
```
Lãi/Gốc:  {ENTITY}_{NH|DH}_{BANK}_{Lai|Goc}
Thu:      T_VNH_{BANK}_{ENTITY}   (chỉ ngắn hạn)
```
Token entity đã xác nhận từ Sheet thật:
- SAP → `SAP`, SAHS → `SAHS`, **ĐTSA → `SADT`** (⚠️ không phải "DTSA", đã sửa)
- YANA → `YANA`, Sao Việt → `SaoViet` — **CHƯA có khoản vay thật trên Sheet**,
  token do Bi Nô đặt trước theo quy luật. Đại ca PHẢI dùng đúng token này
  khi phát sinh khoản vay đầu tiên của YANA/Sao Việt để Sheet khớp ngay từ đầu.

**Dài hạn KHÔNG cần mã Thu** — giải ngân dài hạn cập nhật trực tiếp từ hợp
đồng khi có hợp đồng mới (đại ca xác nhận), không qua Sheet đối chiếu.

### Nhánh B — Pháp nhân "Cá nhân" đứng tên vay hộ
```
Lãi/Gốc:  {NguoiVay}_{BANK}_{SoTienTy}_{Lai|Goc}
VD: Vũ vay BIDV 4.5 tỷ → Vu_BIDV_4.5_Goc
```
**QUY TẮC BẮT BUỘC (đại ca đã chốt):** field `nguoiVay` trên hợp đồng phải
nhập đúng tên ngắn gọn khớp cách Sheet ghi (VD "Vũ" không phải "Nguyễn Khắc
Vũ") — hệ thống tự sinh mã theo `slugNguoiVay()` (lấy từ cuối cùng của tên).
Nếu thiếu `nguoiVay` hoặc `soTienGiaiNgan` → không tự sinh được mã, hệ
thống trả về `canhBaoMa` để UI hiện cảnh báo cho đại ca biết cần bổ sung.

**Không tự động 100% với dữ liệu lịch sử cũ** — các mã kiểu:
- `NV_{BANK}_{ngày}` — vay nhân viên (ngày là ngày trong tháng, không phải
  số tiền hay tên) → parse ra nhưng đánh dấu `xacDinh: false`
- `Ngoai_{ENTITY}_{TenNguoiChoVay}` — DN vay ngoài hệ thống ngân hàng
  (khớp nhóm `goc-vay-cn`/`lai-vay-cn` có sẵn trong `dong-tien-types.ts`)
- `TTD_...` — thẻ tín dụng, không phải khoản vay dài/ngắn hạn qua hợp đồng

→ Các dòng này bị loại khỏi tổng chính (an toàn, tránh đếm trùng) nhưng
đối chiếu engine đánh dấu riêng để đại ca soát tay, không tự động khớp.

**`HanMucNganHan` (hạn mức khung ngắn hạn) chỉ dùng Nhánh A** — theo dữ
liệu Sheet hiện tại, khung ngắn hạn chỉ có ở pháp nhân doanh nghiệp
(SAHS/SAP), chưa thấy dạng cá nhân đứng tên hạn mức khung. Nếu phát sinh
sau này, cần bổ sung.

---

## 4. FILE ĐÃ THIẾT KẾ / CODE ĐÃ VIẾT

| File | Trạng thái | Ghi chú |
|---|---|---|
| `lib/ma-ngan-sach.ts` | ✅ Code đã viết đầy đủ (bản chốt) | Nguồn công thức chân lý dùng chung 2 phía |
| `lib/dong-tien-quy-adapter.ts` | ✅ ĐÃ CẬP NHẬT — dùng `parseMaNganSach` dùng chung từ `ma-ngan-sach.ts`, xóa hàm `parseMaNganSachVay` local trùng lặp | Đọc `data_quy`, lọc `Loại='Thực tế'`, tách hoạt động/vay. **Đã fix 1 lỗi phát hiện ở bản nháp cũ**: hàm local chỉ nhận diện Nhánh A (DN) → dòng vay Nhánh B (Cá nhân, VD `Vu_BIDV_4.5_Goc`) và pattern lịch sử tự do (`NV_/Ngoai_/TTD_`) trước đây bị lọt vào "CP hoạt động" và CỘNG NHẦM vào tổng dòng tiền chính. Bản mới dùng `parsed.xacDinh` để tách 2 nhóm trong `vayRows` (khớp tự động vs cần soát tay). |
| `lib/dong-tien-doi-chieu-engine.ts` | ✅ ĐÃ VIẾT LẠI HOÀN TOÀN — match trực tiếp theo mã ngân sách (không còn đoán theo entity+bank+ngày) | 3 hàm export: `doiChieuDaiHan()` (HĐ thông thường/KyTraNo), `doiChieuNganHan()` (hạn mức khung/KyThuNH — **có hạn chế cố hữu**: mã gắn ở cấp khung nên khi 1 khung có ≥2 bộ hồ sơ chạy song song, không phân biệt chắc chắn dòng Sheet thuộc bộ hồ sơ nào), `doiChieuTatCa()` (hàm tổng hợp nên gọi từ UI — chạy chung 1 `Set` để không đôi bên giành cùng dòng Sheet, tính dư thừa đúng). Thêm trạng thái mới `'khong-xac-dinh'` cho pattern lịch sử tự do (NV_/Ngoai_/TTD_). Mã Thu ngắn hạn (giải ngân) mới chỉ đối chiếu ở mức "có phát sinh" theo khung, **CHƯA khớp được từng bộ hồ sơ cụ thể** — ghi TODO cuối file. |
| `han-muc-types.ts` | ✅ ĐÃ ÁP DỤNG vào file thật | Thêm `maNganSachLai/Goc/Thu` + `canhBaoMa` optional vào `HopDongTinDung` |
| `han-muc-ngan-han-types.ts` | ✅ ĐÃ ÁP DỤNG | Thêm 3 field mã (không có `canhBaoMa`) vào `HanMucNganHan` |
| `han-muc-store.ts` | ✅ ĐÃ ÁP DỤNG vào file thật | `saveHopDong()` đổi return type → `Promise<{id, canhBaoMa?}>`, tự gọi `taoBoMaNganSach()` trước khi ghi Firestore (bỏ qua HĐ `han-muc-khung`). Có `_kyHanCuaHopDong()` suy kỳ hạn. |
| `han-muc-ngan-han-store.ts` | ✅ ĐÃ ÁP DỤNG | `saveHanMucNganHan()` tự gọi `taoBoMaNganSach()` (luôn Nhánh A, `ngan-han`), return type giữ nguyên `Promise<string>` |
| `HopDongForm.tsx` | ✅ ĐÃ SỬA (nhận file gốc từ đại ca, sửa trực tiếp — không dùng patch mẫu nữa) | Thêm state `canhBaoMa`; sửa `handleSubmit` destructure `{ canhBaoMa: canh } = await saveHopDong(...)`, chỉ `onClose()` khi không có cảnh báo; thêm khối JSX cảnh báo vàng trước `{error && ...}` |
| Migration 2 hàm (`migrateMaNganSachDaiHan`, `migrateMaNganSachNganHan`) | ✅ Code đã viết, đã áp vào file thật | Chạy 1 lần cho hợp đồng/hạn mức cũ chưa có mã — **CHƯA CHẠY THẬT trên dữ liệu Firestore** |
| `markKyDaTraThucTe` (dài hạn), `markKyThuDaThu` (ngắn hạn) | ✅ ĐÃ CÓ SẴN trong 2 store — dùng thẳng cho nút "Đồng bộ" | Không cần viết hàm ghi mới, chỉ cần lớp gọi mỏng |
| Nút "Đồng bộ" ở bảng đối chiếu | ⏳ Thiết kế xong (lớp gọi mỏng quanh 2 hàm trên), CHƯA viết UI | Hiện cảnh báo lệch → hỏi đồng bộ → nếu OK thì gọi `markKyDaTraThucTe`/`markKyThuDaThu` |
| `DongTienGapAnalysis.tsx` (Phần 5 — card thiếu hụt theo tuần) | ❌ Chưa viết | Không dùng ngưỡng, cứ thiếu là báo (kể cả tổng thể lẫn từng pháp nhân) |
| `TabDongTien.tsx` | ❌ Chưa nối thêm nguồn thứ 3 (`data_quy`) | Cần subscribe thêm, truyền `soDuBanDau` thật vào `DongTienView` thay vì để trống (hiện đang tính tồn quỹ "tương đối") |

---

## 5. FILE GỐC ĐÃ CÓ SẴN (đại ca đã gửi, không cần gửi lại trừ khi hỏi)

Module Dòng tiền: `dong-tien-types.ts`, `dong-tien-engine.ts`,
`dong-tien-store.ts`, `dong-tien-hanmuc-adapter.ts`, `dong-tien-ke-hoach-store.ts`,
`dong-tien-nhom-store.ts`, `TabDongTien.tsx`, `DongTienView.tsx`,
`DongTienTongHop.tsx`, `DongTienTimeline.tsx`, `DongTienChiTiet.tsx`,
`DongTienBangChiTiet.tsx`, `DongTienTuDong.tsx`, `DongTienNhomChiTiet.tsx`,
`DongTienForm.tsx`, `DongTienKeHoachForm.tsx`, `page.tsx` (test-dong-tien)

Module Hạn mức tín dụng: `han-muc-types.ts`, `han-muc-store.ts` (đầy đủ),
`han-muc-ngan-han-types.ts`, `han-muc-ngan-han-store.ts` (đầy đủ),
`han-muc-entities-store.ts`

Module Ngân sách (tham khảo logic tồn quỹ + KMCP mapping):
`ngan-sach-types.ts`, `ngan-sach-store.ts`, `ngan-sach-mapping.ts`,
`ngan-sach-export.ts`, `TabGiaiPhap.tsx`, `page.tsx` (ngan-sach)

**CHƯA CÓ (cần nếu đụng tới):** `HopDongForm.tsx`, `KhungForm.tsx` (hoặc
tên tương đương form tạo hạn mức ngắn hạn), `TabHanMuc.tsx`,
`LichTraNoTable.tsx` — cần khi sửa chỗ gọi `saveHopDong()` (đổi return type)
và khi thêm UI hiển thị mã ngân sách/cảnh báo trên form.

---

## 6. VIỆC CẦN LÀM TIẾP (theo thứ tự ưu tiên đề xuất)

1. **Nền tảng — ✅ ĐÃ XONG (Bước 1 hoàn thành):**
   - ✅ Áp dụng field mới vào `han-muc-types.ts` + `han-muc-ngan-han-types.ts`
   - ✅ Áp dụng đoạn code gắn mã vào `saveHopDong` + `saveHanMucNganHan`
   - ✅ Sửa chỗ gọi `saveHopDong()` trong `HopDongForm.tsx` theo return type mới
   - ⏳ **CHƯA LÀM**: chạy 2 hàm migration (`migrateMaNganSachDaiHan`, `migrateMaNganSachNganHan`) 1 lần thật trên dữ liệu Firestore — code đã sẵn sàng, chỉ cần gọi (VD: nút tạm trong dev tools hoặc script chạy 1 lần)
2. **Bước 2 — ✅ ĐÃ XONG:** Cập nhật `dong-tien-quy-adapter.ts` dùng `parseMaNganSach` từ `ma-ngan-sach.ts` (đã xóa hàm `parseMaNganSachVay` cũ trùng lặp). Nhân tiện fix 1 lỗi: dòng vay Nhánh B (Cá nhân) + pattern lịch sử tự do (`NV_/Ngoai_/TTD_`) trước đây bị cộng nhầm vào tổng chính — giờ đã tách đúng vào `vayRows` (dùng cờ `parsed.xacDinh` để phân biệt khớp tự động vs cần soát tay).
3. **Bước 3 — ✅ ĐÃ XONG:** Viết lại `dong-tien-doi-chieu-engine.ts` match theo mã ngân sách — có cả bản dài hạn LẪN ngắn hạn (bản nháp cũ chỉ có TODO cho ngắn hạn). Xem chi tiết + hạn chế còn tồn tại ở bảng file mục 4.
4. Viết UI bảng đối chiếu + nút "Đồng bộ" (dùng `markKyDaTraThucTe`/`markKyThuDaThu` có sẵn — dùng `kyRef` mới trong `DoiChieuRow` để biết gọi hàm nào: có `hopDongId` → dài hạn, có `hanMucId`+`boHoSoId` → ngắn hạn) — **bước tiếp theo**
5. Nối nguồn `data_quy` vào `TabDongTien.tsx`, truyền `soDuBanDau` thật
6. Viết `DongTienGapAnalysis.tsx` — card thiếu hụt theo tuần, không ngưỡng

---

## 7. TRẠNG THÁI HIỆN TẠI

📍 Đang ở bước: **Bước 1 (Nền tảng) đã hoàn thành 100% về code**:
   - `han-muc-types.ts`, `han-muc-ngan-han-types.ts` — đã áp field mã ngân sách.
   - `han-muc-store.ts`, `han-muc-ngan-han-store.ts` — đã áp code sinh mã khi save
     + đã có 2 hàm migration.
   - `HopDongForm.tsx` — đã sửa xong theo return type mới của `saveHopDong()`
     (state `canhBaoMa`, destructure kết quả, JSX cảnh báo vàng).

   ⚠️ Việc còn lại của Bước 1 trước khi coi là xong hoàn toàn: **đại ca cần
   tự chạy `migrateMaNganSachDaiHan()` và `migrateMaNganSachNganHan()` một
   lần trên dữ liệu Firestore thật** (qua nút tạm trong dev tools hoặc
   script) để gắn mã cho hợp đồng/hạn mức cũ. AI chưa xác nhận đại ca đã
   chạy hay chưa — **phiên sau cần hỏi lại đại ca đã chạy migration chưa**
   trước khi coi Bước 1 là đóng hẳn.

📍 Bước tiếp theo (mục 6, bước 4): viết UI bảng đối chiếu (Phần 5) + nút
   "Đồng bộ", dùng `doiChieuTatCa()` làm nguồn dữ liệu. Mỗi `DoiChieuRow`
   đã có sẵn `kyRef` để biết gọi hàm ghi nào:
     - có `hopDongId` (không có `hanMucId`) → dài hạn, gọi
       `markKyDaTraThucTe(hopDongId, kyId, ...)` (đã có sẵn trong
       `han-muc-store.ts`)
     - có `hanMucId` + `boHoSoId` → ngắn hạn, gọi
       `markKyThuDaThu(hanMucId, boHoSoId, kyId, ngayThucThu, gocThucThu,
       laiThucThu)` (đã có sẵn trong `han-muc-ngan-han-store.ts`)
   UI nên hiển thị riêng nhóm `trangThai === 'khong-xac-dinh'` (pattern
   lịch sử tự do NV_/Ngoai_/TTD_) tách biệt khỏi `'sheet-du-thua'` (HĐ
   thật nhưng trả sớm/ngoài lịch) vì ý nghĩa khác nhau.

⚠️ Hạn chế còn tồn tại (không phải lỗi, đã ghi rõ trong code):
   - Mã Thu ngắn hạn (giải ngân) mới đối chiếu ở mức "khung", chưa khớp
     được từng bộ hồ sơ cụ thể — cần dữ liệu ngày giải ngân thực tế để
     làm chính xác hơn (xem TODO cuối `dong-tien-doi-chieu-engine.ts`).
   - Khung ngắn hạn có ≥2 bộ hồ sơ chạy song song cùng lúc → không phân
     biệt chắc chắn 1 dòng Sheet thuộc bộ hồ sơ nào (hạn chế cố hữu của
     cách Sheet ghi mã ở cấp khung, đã chốt trong log mục 3).

📎 File cần đại ca đính kèm ở phiên sau (nếu làm tiếp bước 4):
   `DongTienBangChiTiet.tsx` hoặc tên tương đương (nếu có UI bảng sẵn để
   tham khảo style), `TabDongTien.tsx`, `DongTienView.tsx` (để biết chỗ
   gắn thêm tab/section Phần 5 mới).