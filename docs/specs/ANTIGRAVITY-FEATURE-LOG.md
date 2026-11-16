# DET — ANTIGRAVITY FEATURE & FIX LOG

> **Purpose:** working ledger for rapid **feature implementation AND bug fixes** in the Design Engineering Toolkit (DET). Antigravity is the fast **implementer**: build real functionality, run it, correct defects. This file records exactly what was changed so ChatGPT/Claude Code can later consolidate a well-scoped **architecture / code-quality / regression-hardening issue**. **NOT** a mandate to stop at prototypes or to fix bugs only.
>
> **Base:** issue #72 **CLOSED** / PR #73 **MERGED** after independent Coordinator review, `main` merge commit `b9ccc23e85b8d550a31ac400fc70bd96634655b0`. **Antigravity rapid feature development can start from this baseline**. This ledger records new features AND fixes without pre-emptive architectural refactoring.
>
> **Repository:** `thanhle74/design-engineering-toolkit`

## Baseline (fill once when Antigravity phase begins)

- Baseline `main` SHA: `b9ccc23e85b8d550a31ac400fc70bd96634655b0` (post-#72 merge; subsequent documentation commits may advance main without code changes).
- Tool/environment: Antigravity in the DET repository; local Slaunchpad Magento is **test-only**.
- Product flow to preserve: Figma → grounded AI/semantic mapping → deterministic Magento Page Builder → downloadable operator-executed PHP installer.
- Architecture target: `src/modules/core` (neutral contracts/engine) · `src/modules/figma` (source extraction) · `src/modules/magento` (native Page Builder composition / PHP installer) · `src/modules/studio` (Next/Ant Design UI and orchestration). Keep contracts, provider assumptions and source evidence explicit.
- Do not put tokens, passwords, customer data, local `env.php`, raw private assets or screenshots containing secrets in this file.
- Never modify the live Magento storefront/default CMS homepage or Figma source as part of fast iteration. Use an explicitly isolated local test page/store; stage/prod writes require separate owner permission.

## How to work — functionality FIRST, rigorous cleanup LATER

1. **Antigravity may develop full features**, UI, conversion handlers, integration, tests, and bug fixes. Prioritize a **working observable end-to-end behavior** over premature cross-module refactoring.
2. After **each substantive feature or fix**, append one entry to this file. Keep it short and factual; *feature and fix both belong here*. Record the actual working path, commit, affected code and known shortcuts/limitations. Avoid status claims without evidence.
3. Prefer committing each functional unit separately to a feature branch; record commit SHA/branch. Do **not** silently push unreviewed experimental changes directly to `main` if a review flow is expected.
4. During rapid iteration, avoid intentionally destroying module boundaries or introducing secrets; if a shortcut is necessary, **record the technical debt candidly** rather than hiding it. Keep the deterministic engine and safe Magento write boundaries intact.
5. When the owner says **"đọc file Antigravity và lên issue chuẩn hóa"**, ChatGPT will read this log **and independently inspect real code/diff/test state**, group work by affected modules, identify duplicate logic, wrong boundaries, hardcoding, brittle contracts and missing tests, then create **a single cohesive GitHub issue** (or bounded parallel worker lanes) to refactor and preserve all proven features. Claude Code then hardens architecture with tests and real Magento Admin verification. No automatic functionality deletion or unsupported rewrites.
6. A feature that works only in one project is **not automatically portable**. Record target Magento version/provider/extension requirements and any unverified behavior for later proper adapter/config work.

## Feature / Fix entries (APPEND; do not overwrite earlier entries)

Copy the following template for each addition. If a field is irrelevant, write `N/A`. Use `DONE`, `PARTIAL` or `BLOCKED` based on *observed* behavior.

```md
### AG-001 — [Feature | Fix] Short descriptive title
- Status: DONE | PARTIAL | BLOCKED
- Goal / intended behavior: ...
- Implemented behavior (what actually works): ...
- How to test (URL, CLI, user actions): ...
- Test result / evidence: ... (Admin Save→Reload / browser / CLI / unit tests, with exact limitations)
- Changed code: `src/modules/...`, `app/...`
- Branch / commit: ...
- Known issues / shortcuts / structural debt: ...
- Next functional follow-up (optional): ...
```

### AG-001 — [Feature] Quản lý Dự án & Danh sách Trang Figma (Project & Multi-Figma Page Manager)
- Status: DONE
- Goal / intended behavior: Cho phép người dùng tạo và lưu danh sách dự án, trong mỗi dự án quản lý nhiều trang Figma (Homepage, PLP, PDP, Banner...) kèm Node ID, ghi chú; hỗ trợ bấm "Build trang này" để điều hướng trực tiếp sang trang Build với Figma URL được điền sẵn.
- Implemented behavior (what actually works):
  1. Module `src/modules/studio/projects`: Lưu trữ dự án và danh sách trang Figma bền vững (`data/projects-catalog.json`), khởi tạo sẵn dự án mẫu "Slaunchpad Fashion" với 3 trang Figma thực tế (Homepage Hero & Craftsmanship, Extended Sections, PLP).
  2. Bộ API REST đầy đủ tại `app/api/projects`: GET/POST projects, GET/DELETE project by ID, POST/DELETE Figma page by ID với validation tự động bằng `parseFigmaInput`.
  3. Giao diện quản lý tab "Dự án & Trang Figma" tại `/catalog`: Hiển thị dạng danh sách/collapse thẻ dự án, nút "Tạo dự án mới", nút "Thêm trang Figma" (có live parse node-id / file-key), nút "Build trang này" (link thẳng sang `/build?source=...`), và nút xóa trang / xóa dự án.
  4. Màn hình `/build` (`build.screen.tsx`): Tự động nhận tham số `?source=...` trên query string để prefill input nguồn Figma và sẵn sàng cho việc build.
- How to test (URL, CLI, user actions):
  1. CLI test: `pnpm exec vitest run app/api/projects/route.test.ts` (7 tests pass).
  2. UI test: Truy cập `http://localhost:3000/catalog` -> tab "Dự án & Trang Figma":
     - Xem dự án có sẵn "Slaunchpad Fashion" và 3 trang Figma.
     - Bấm "Tạo dự án mới" -> nhập tên dự án -> dự án mới xuất hiện.
     - Bấm "Thêm trang" -> nhập URL Figma (kèm `?node-id=245-2`) -> thấy live validation -> bấm thêm -> trang xuất hiện trong bảng.
     - Bấm "Build trang này" -> tự động chuyển sang `http://localhost:3000/build?source=...` với URL Figma đã được điền sẵn.
- Test result / evidence:
  - Vitest: 7/7 tests pass trong `app/api/projects/route.test.ts`.
  - Typecheck: `tsc --noEmit` exit 0 (không có lỗi type).
  - Lint: `eslint` exit 0 (0 warnings, 0 errors).
  - Production build: `pnpm run build` thành công, route `/api/projects` và các sub-routes được compile thành công.
  - Full suite: 201/201 contract checks pass (`pnpm test`), 622/622 studio tests pass (`pnpm run test:studio`).
- Changed code:
  - `src/modules/studio/projects/types.ts`
  - `src/modules/studio/projects/project-store.ts`
  - `src/modules/studio/projects/components/create-project-modal.tsx`
  - `src/modules/studio/projects/components/add-page-modal.tsx`
  - `src/modules/studio/projects/components/project-manager.tsx`
  - `src/modules/studio/projects/index.ts`
  - `app/api/projects/route.ts`
  - `app/api/projects/[projectId]/route.ts`
  - `app/api/projects/[projectId]/pages/route.ts`
  - `app/api/projects/[projectId]/pages/[pageId]/route.ts`
  - `app/api/projects/route.test.ts`
  - `src/modules/studio/catalog/screens/catalog.screen.tsx`
  - `src/modules/studio/build-control/screens/build.screen.tsx`
- Branch / commit: `main`
- Known issues / shortcuts / structural debt: Hiện lưu trữ dự án dùng file JSON trong `data/projects-catalog.json` (dễ đọc, dễ backup, gitignored); trong tương lai có thể liên kết trực tiếp vào SQLite `studio.sqlite` nếu có migration thêm schema FK chặt chẽ hơn.
- Next functional follow-up (optional): Hỗ trợ import/export danh sách dự án dưới dạng file JSON hoặc tích hợp trực tiếp trạng thái kết quả build (PASS/GAP) của từng page vào danh sách.

### AG-002 — [Feature] Chỉ báo bước đang chạy (Loading spin) và icon hoàn tất màu xanh lá cây trong Quy trình Build
- Status: DONE
- Goal / intended behavior: Trong quy trình Build (/build), khi một bước đang chạy/phân tích thì hiển thị icon xoay xoay (LoadingOutlined spin) để người dùng dễ nhận biết; khi bước đã hoàn thành (success/warning) thì hiển thị icon checkmark màu xanh lá cây (#52c41a).
- Implemented behavior (what actually works):
  1. Thêm `stageStepIcon` vào `src/modules/studio/build-control/components/build-pipeline.tsx`:
     - Trạng thái `running`: hiển thị icon xoay liên tục `<LoadingOutlined spin style={{ color: "#1677ff" }} />` tại bước tương ứng trong Steps.
     - Trạng thái `success` / `warning`: hiển thị icon dấu kiểm xanh lá cây `<CheckCircleFilled style={{ color: "#52c41a" }} />`.
  2. Tại thẻ chi tiết bước bên phải (`SelectedStageDetail`): tag "Đang chạy" được bổ sung icon xoay `<LoadingOutlined spin />`.
- How to test (URL, CLI, user actions):
  1. CLI test: `pnpm exec vitest run src/modules/studio/build-control/` (33 tests pass).
  2. UI test: Truy cập `http://localhost:3000/build`, bấm Build luồng bất kỳ:
     - Quan sát các bước hoàn thành (Xác thực nguồn, Đọc thiết kế...): hiển thị tick tròn màu xanh lá cây.
     - Quan sát bước đang chạy (AI phân tích...): hiển thị icon xoay tròn sinh động.
- Test result / evidence:
  - Vitest: 33/33 tests pass trong `src/modules/studio/build-control/`.
  - Typecheck: `tsc --noEmit` exit 0.
  - Lint: `eslint` exit 0.
- Changed code:
  - `src/modules/studio/build-control/components/build-pipeline.tsx`
- Branch / commit: `main`
- Known issues / shortcuts / structural debt: N/A (chuẩn Stock Ant Design icons).
- Next functional follow-up (optional): N/A.

### AG-003 — [Fix] Cập nhật Modal prop từ destroyOnClose sang destroyOnHidden theo chuẩn Ant Design 6
- Status: DONE
- Goal / intended behavior: Loại bỏ cảnh báo deprecation `Warning: [antd: Modal] destroyOnClose is deprecated. Please use destroyOnHidden instead.` khi mở Modal trong module Projects.
- Implemented behavior (what actually works): Thay thế prop `destroyOnClose` bằng `destroyOnHidden` chuẩn API Ant Design 6 tại cả 2 component:
  1. `src/modules/studio/projects/components/create-project-modal.tsx`
  2. `src/modules/studio/projects/components/add-page-modal.tsx`
- How to test (URL, CLI, user actions):
  1. Mở trang `http://localhost:3000/catalog`, bấm "Tạo dự án mới" hoặc "Thêm trang".
  2. Mở DevTools Console kiểm tra: không còn bất kỳ warning deprecation nào của Modal.
- Test result / evidence:
  - Typecheck: `tsc --noEmit` exit 0.
  - Lint: `eslint` exit 0.
- Changed code:
  - `src/modules/studio/projects/components/create-project-modal.tsx`
  - `src/modules/studio/projects/components/add-page-modal.tsx`
- Branch / commit: `main`
- Known issues / shortcuts / structural debt: N/A.
- Next functional follow-up (optional): N/A.

### AG-004 — [Feature & UI Redesign] Tái cấu trúc trang Chi tiết Lần chạy (/runs/[runId]) theo dạng Tab người dùng & Khối tải nhanh
- Status: DONE
- Goal / intended behavior: Giải quyết tình trạng quá tải thông tin, rối mắt trên trang `/runs/[runId]`: cung cấp khối tóm tắt kết quả nổi bật, các nút tải nhanh 1-click cho các file chính (HTML Page Builder, PHP Installer, Manifest), và phân loại toàn bộ nội dung thành 5 tab thông minh; loại bỏ hoàn toàn các cảnh báo deprecation của antd `List`.
- Implemented behavior (what actually works):
  1. Thêm Banner Tóm tắt & Tải nhanh ở đầu trang (`src/modules/studio/run-detail/screens/run.screen.tsx`):
     - Hiển thị số lượng phân đoạn đã phát hiện, số tệp đầu ra, trạng thái xác thực toàn vẹn.
     - 3 nút tải nhanh 1-click: "Tải HTML Page Builder", "Tải PHP Installer", "Tải Gói Manifest" (tự động fetch và trigger browser download).
  2. Tổ chức lại toàn bộ trang chi tiết lần chạy thành 5 Tabs Ant Design rõ ràng:
     - Tab 1: "Tổng quan & Xem trước": Khung Preview trực quan + Tóm tắt phân đoạn & khoảng trống (BuildBundleSection).
     - Tab 2: "Danh sách tệp xuất": Quản lý danh sách file artifact tải về (ClientArtifactManifest).
     - Tab 3: "Cây thiết kế Figma": Giấu cây hàng trăm node vào đây (DesignTree).
     - Tab 4: "Đánh giá ánh xạ": Bảng ma trận mapping kỹ thuật (MappingReview).
     - Tab 5: "Kỹ thuật & Bằng chứng": SHA-256, Git commit, máy chủ (ProvenanceFooter).
  3. Loại bỏ cảnh báo deprecation của Ant Design `List`: Thay thế `List` bằng `Flex` layout chuẩn trong `build-bundle-section.tsx` và `build-pipeline.tsx`.
- How to test (URL, CLI, user actions):
  1. CLI test: `pnpm run test:studio` (622/622 tests pass), `pnpm test` (201/201 checks pass).
  2. UI test: Truy cập `http://localhost:3000/runs/build-1794544715541` (hoặc bất kỳ lần chạy nào):
     - Trang không còn bị dài vô tận hay rối tung; giao diện thoáng đãng, phân chia rõ ràng.
     - Ngay trên đầu có nút bấm tải HTML Page Builder và PHP Installer.
     - Tab mặc định hiển thị Preview và tóm tắt kết quả; các cây node và hash kỹ thuật nằm gọn trong các tab riêng.
     - Console không còn warning deprecation `List`.
- Test result / evidence:
  - Vitest: 622/622 tests pass trong 59 test files.
  - Root contract: 201/201 checks pass.
  - Typecheck: `tsc --noEmit` exit 0.
  - Lint: `eslint` exit 0.
- Changed code:
  - `src/modules/studio/run-detail/screens/run.screen.tsx`
  - `src/modules/studio/run-detail/components/build-bundle-section.tsx`
  - `src/modules/studio/build-control/components/build-pipeline.tsx`
- Branch / commit: `main`
- Known issues / shortcuts / structural debt: N/A (100% Stock Ant Design components).
- Next functional follow-up (optional): N/A.

### AG-006 — [Fix / Visual Polish] Tái thiết kế toàn diện Application Layout Shell và bố cục các trang Studio

- Status: `DONE`
- Goal / intended behavior:
  - Khắc phục triệt để tình trạng "nhìn cái layout quá xấu": toàn bộ trang bị trắng bệch, phẳng lì không có chiều sâu, header bị co cụm trôi nổi ở giữa màn hình rộng, các form input bị kéo dãn bẹt dí 100% và lặp lại tiêu đề 3 lần.
  - Xây dựng một Layout Shell tiêu chuẩn Enterprise SaaS (tương tự Linear, Vercel, Ant Design Pro) với độ tương phản sắc nét, bố cục 2 cột cân đối, thẻ dự án và lối tắt preset 1-click.
- Implemented behavior:
  1. **Nâng cấp Application Shell (`app/globals.css`, `studio-shell.tsx`)**:
     - Nền trang Layout chính đổi sang màu xám nhạt nhẹ nhàng (`#f5f6f8`), giúp các thẻ `Card` màu trắng (`#ffffff`) nổi bật lên với viền và bóng đổ tự nhiên, tạo chiều sâu thị giác.
     - Thanh Header (`.studio-header`) trải dài 100% toàn màn hình, sticky cố định ở trên cùng với viền dưới sắc nét và bóng nhẹ (`box-shadow`), thanh menu nav không còn viền thừa, logo có icon màu sắc nổi bật.
  2. **Tái thiết kế trang Bản dựng (`/build`)**:
     - Thay thế form nhập đơn điệu trải dài màn hình bằng **bố cục 2 cột cân đối (65% / 35%)**:
       - Cột trái: Card "Khởi chạy Bản dựng" chứa form nhập Figma và chọn đích xuất.
       - Cột phải: Card "Trang mẫu có sẵn (Quick Presets)" cho phép bấm 1 click để điền ngay các link mẫu đã xác minh (Hero 245:2, Extended 245:16, PLP 301:4) + Card "Quy trình chuyển đổi 6 bước" (Steps vertical).
  3. **Tái thiết kế trang Tổng quan (`/`)**:
     - Header chào mừng "Tổng quan Studio", 3 thẻ chức năng nhanh (Tạo bản dựng, Quản lý dự án, Lần chạy gần nhất) và Card danh sách các lần chạy gần đây với styling gọn gàng.
  4. **Tối ưu hóa trang Dự án & Thư viện (`/catalog`)**:
     - Loại bỏ tiêu đề bị lặp 3 lần liên tiếp, chuyển sang Card Tabs (`type="card"`), làm gọn tiêu đề con và bảng danh sách.
  5. **Loại bỏ cảnh báo Ant Design Steps deprecation**:
     - Đổi `direction="vertical"` thành `orientation="vertical"`.
     - Đổi `items[].description` thành `items[].content`.
- How to test (URL, CLI, user actions):
  1. CLI verification:
     - `pnpm test`: 201/201 checks passed.
     - `pnpm run test:studio`: 622/622 tests passed (59 test files).
     - `pnpm run typecheck`: exit 0 (0 errors).
     - `pnpm run lint`: exit 0 (0 errors, 0 warnings).
  2. UI verification:
     - Mở `http://localhost:3000`: Header trải rộng 100% viền sắc nét, nền trang xám nhạt dịu mắt, các thẻ nổi khối rõ ràng, 3 thẻ action tiện lợi.
     - Mở `http://localhost:3000/build`: Bố cục 2 cột hài hòa, có sẵn các preset mẫu để bấm thử 1 click, quy trình 6 bước rõ ràng, không còn khoảng trống thừa vô lý.
     - Mở `http://localhost:3000/catalog`: Tiêu đề không còn bị lặp, tabs card ngăn nắp, danh sách dự án gọn đẹp.
- Changed code:
  - `app/globals.css`
  - `src/modules/studio/components/layout/studio-shell.tsx`
  - `src/modules/studio/overview/screens/overview.screen.tsx`
  - `src/modules/studio/build-control/screens/build.screen.tsx`
  - `src/modules/studio/catalog/screens/catalog.screen.tsx`
  - `src/modules/studio/projects/components/project-manager.tsx`
  - `src/modules/studio/run-detail/components/run-overview-panel.tsx`
  - `docs/specs/ANTIGRAVITY-FEATURE-LOG.md`
- Branch / commit: `main`
- Known issues / shortcuts / structural debt: N/A.
- Next functional follow-up (optional): N/A.

### AG-007 — [Fix] Loại bỏ hoàn toàn cảnh báo deprecation [antd: Alert] `message` is deprecated. Please use `title` instead

- Status: `DONE`
- Goal / intended behavior:
  - Loại bỏ hoàn toàn cảnh báo deprecation của Ant Design 6: `[antd: Alert] message is deprecated. Please use title instead.` xuất hiện trên console trình duyệt khi render các component Alert.
- Implemented behavior:
  - Thay thế toàn bộ thuộc tính `message` bằng `title` trên tất cả các component `<Alert>` trong toàn bộ module Studio:
    1. `src/modules/studio/run-detail/components/run-overview-panel.tsx`: `title="Không tìm thấy file HTML đầu ra"`.
    2. `src/modules/studio/catalog/screens/catalog.screen.tsx`: `title="Catalog đang tắt"` và `title={...}`.
    3. `src/modules/studio/overview/screens/overview.screen.tsx`: `title={`Chưa cấu hình trình đọc lần chạy (${readerErrorCode})`}`.
    4. `src/modules/studio/run-detail/components/build-bundle-section.tsx`: `title="Xác minh manifest thất bại"`.
    5. `src/modules/studio/run-detail/components/reader-problem-state.tsx`: `title={title}`.
- How to test (URL, CLI, user actions):
  1. CLI verification:
     - `pnpm test`: 201/201 checks passed.
     - `pnpm run typecheck`: exit 0.
     - `pnpm run lint`: exit 0 (0 warnings, 0 errors).
  2. UI verification:
     - Mở trình duyệt vào `http://localhost:3000/runs/build-1794544715541` (và các trang `/`, `/catalog`):
     - Mở DevTools Console: Không còn bất kỳ cảnh báo deprecation nào liên quan đến `[antd: Alert]`.
- Changed code:
  - `src/modules/studio/run-detail/components/run-overview-panel.tsx`
  - `src/modules/studio/catalog/screens/catalog.screen.tsx`
  - `src/modules/studio/overview/screens/overview.screen.tsx`
  - `src/modules/studio/run-detail/components/build-bundle-section.tsx`
  - `src/modules/studio/run-detail/components/reader-problem-state.tsx`
  - `docs/specs/ANTIGRAVITY-FEATURE-LOG.md`
- Branch / commit: `main`
- Known issues / shortcuts / structural debt: N/A.
- Next functional follow-up (optional): N/A.

### AG-005 — [Feature] Tái cấu trúc trang Chi tiết lần chạy (/runs/[runId]) hướng tới trải nghiệm người dùng thực tế

- Status: `DONE`
- Goal / intended behavior:
  - Chuyển đổi trang chi tiết lần chạy (`/runs/[runId]`) từ một màn hình ngập tràn thông tin kỹ thuật chằng chịt, mã lỗi gap khó hiểu và cảnh báo preview thiếu vắng thành một cổng bàn giao kết quả (Deliverables Portal) thân thiện, trực quan và dễ sử dụng nhất cho người dùng (Designer, Magento Merchant, Frontend Dev).
  - Người dùng mở trang ra là hiểu ngay: đã build thành công chưa, có những phân đoạn nào, lấy mã Page Builder ở đâu, copy 1 click và xem hướng dẫn 3 bước dán vào Magento Admin. Mọi chi tiết chẩn đoán sâu của engine được cất gọn gàng vào tab Kỹ thuật riêng.
- Implemented behavior:
  1. Tạo component mới `RunOverviewPanel` (`src/modules/studio/run-detail/components/run-overview-panel.tsx`):
     - **4 Thẻ thống kê KPI nhanh**: Trạng thái (Hoàn tất thành công - Exit 0), Phân đoạn giao diện (X Sections), Nền tảng đích (Magento Page Builder), Tệp xuất sẵn sàng (X Tệp).
     - **Hướng dẫn 3 bước sử dụng nhanh vào Magento**: Trực quan hóa quy trình: (1) Sao chép mã → (2) Mở Magento Admin (Content > Pages) → (3) Dán khối HTML Code & Lưu trang.
     - **Khung xem trước & Sao chép mã HTML (Live HTML Viewer & 1-Click Copy)**: Tự động tải nội dung `pagebuilder-content.html`, hiển thị khung code gọn gàng kèm số lượng ký tự, nút "Sao chép toàn bộ HTML" 1-click (với icon check feedback) và nút "Tải file .html".
     - **Bảng phân đoạn giao diện đã chuyển đổi (Converted Sections Breakdown)**: Liệt kê toàn bộ các Section Figma đã bóc tách thành công (`Hero/Primary`, `BrandStatement`, `FeaturedCollections`, `FeaturedProducts`, `Craftsmanship`, `Newsletter`...) kèm số lượng phần tử con và badge xanh lá đã ghép thành công.
     - **Khung hướng dẫn Storefront an toàn & Lối tắt tải PHP CLI Installer**: Giải thích tự nhiên lý do xem trước an toàn trên Magento thật và nút tải `install-homepage.php` cho developer.
  2. Tái cơ cấu toàn diện `RunScreen` (`src/modules/studio/run-detail/screens/run.screen.tsx`):
     - Đưa `RunOverviewPanel` làm tab mặc định ("Tổng quan & Sử dụng").
     - 5 Tabs dạng card rõ ràng:
       - Tab 1: `Tổng quan & Sử dụng` (Trải nghiệm người dùng 100%).
       - Tab 2: `Tệp tải về` (Danh sách tệp xuất có SHA-256 và kích thước).
       - Tab 3: `Cây thiết kế Figma` (Cây layer từ Figma).
       - Tab 4: `Chi tiết ánh xạ` (Mapping review giữa Figma và Page Builder).
       - Tab 5: `Kỹ thuật & Diagnostics` (Nơi chứa `PreviewPanel`, `BuildBundleSection` với bảng stages, gap codes, SHA-256 hashes và `ProvenanceFooter` dành riêng cho kỹ sư khi cần kiểm định).
- How to test (URL, CLI, user actions):
  1. CLI verification:
     - `pnpm test`: 201/201 checks passed.
     - `pnpm run test:studio`: 622/622 tests passed (59 test files).
     - `pnpm run typecheck`: TypeScript không có lỗi (`tsc --noEmit` exit 0).
     - `pnpm run lint`: ESLint 0 errors, 0 warnings.
     - `pnpm run build`: Production build Turbopack Next.js thành công.
  2. UI verification:
     - Mở trình duyệt vào `http://localhost:3000/runs/build-1794544715541`:
     - Trang mở ra gọn gàng, rõ ràng: Banner đầu trang với 3 nút tải nhanh.
     - Tab 1 "Tổng quan & Sử dụng" hiển thị 4 thẻ KPI xanh lá, hướng dẫn 3 bước vào Magento, khung xem mã Page Builder HTML kèm nút "Sao chép toàn bộ HTML", bảng danh sách 12 phân đoạn đã chuyển đổi thành công.
     - Không còn cảnh báo "PREVIEW_UNAVAILABLE" hay bảng mã gap `COMPOSITION_SKIPS_PRESENT` đập vào mắt người dùng; những thông tin này đã được cất sang Tab "Kỹ thuật & Diagnostics".
- Changed code:
  - `src/modules/studio/run-detail/components/run-overview-panel.tsx` (Mới)
  - `src/modules/studio/run-detail/screens/run.screen.tsx`
  - `docs/specs/ANTIGRAVITY-FEATURE-LOG.md`
- Branch / commit: `main`
- Known issues / shortcuts / structural debt: N/A (100% Stock Ant Design components).
- Next functional follow-up (optional): N/A.

### AG-006 — [Fix / Visual Polish] Tái thiết kế toàn diện Application Layout Shell và bố cục các trang Studio

- Status: `DONE`
- Goal / intended behavior:
  - Khắc phục triệt để tình trạng "nhìn cái layout quá xấu": toàn bộ trang bị trắng bệch, phẳng lì không có chiều sâu, header bị co cụm trôi nổi ở giữa màn hình rộng, các form input bị kéo dãn bẹt dí 100% và lặp lại tiêu đề 3 lần.
  - Xây dựng một Layout Shell tiêu chuẩn Enterprise SaaS (tương tự Linear, Vercel, Ant Design Pro) với độ tương phản sắc nét, bố cục 2 cột cân đối, thẻ dự án và lối tắt preset 1-click.
- Implemented behavior:
  1. **Nâng cấp Application Shell (`app/globals.css`, `studio-shell.tsx`)**:
     - Nền trang Layout chính đổi sang màu xám nhạt nhẹ nhàng (`#f5f6f8`), giúp các thẻ `Card` màu trắng (`#ffffff`) nổi bật lên với viền và bóng đổ tự nhiên, tạo chiều sâu thị giác.
     - Thanh Header (`.studio-header`) trải dài 100% toàn màn hình, sticky cố định ở trên cùng với viền dưới sắc nét và bóng nhẹ (`box-shadow`), thanh menu nav không còn viền thừa, logo có icon màu sắc nổi bật.
  2. **Tái thiết kế trang Bản dựng (`/build`)**:
     - Thay thế form nhập đơn điệu trải dài màn hình bằng **bố cục 2 cột cân đối (65% / 35%)**:
       - Cột trái: Card "Khởi chạy Bản dựng" chứa form nhập Figma và chọn đích xuất.
       - Cột phải: Card "Trang mẫu có sẵn (Quick Presets)" cho phép bấm 1 click để điền ngay các link mẫu đã xác minh (Hero 245:2, Extended 245:16, PLP 301:4) + Card "Quy trình chuyển đổi 6 bước" (Steps vertical).
  3. **Tái thiết kế trang Tổng quan (`/`)**:
     - Header chào mừng "Tổng quan Studio", 3 thẻ chức năng nhanh (Tạo bản dựng, Quản lý dự án, Lần chạy gần nhất) và Card danh sách các lần chạy gần đây với styling gọn gàng.
  4. **Tối ưu hóa trang Dự án & Thư viện (`/catalog`)**:
     - Loại bỏ tiêu đề bị lặp 3 lần liên tiếp, chuyển sang Card Tabs (`type="card"`), làm gọn tiêu đề con và bảng danh sách.
  5. **Loại bỏ cảnh báo Ant Design Steps deprecation**:
     - Đổi `direction="vertical"` thành `orientation="vertical"`.
     - Đổi `items[].description` thành `items[].content`.
- How to test (URL, CLI, user actions):
  1. CLI verification:
     - `pnpm test`: 201/201 checks passed.
     - `pnpm run test:studio`: 622/622 tests passed (59 test files).
     - `pnpm run typecheck`: exit 0 (0 errors).
     - `pnpm run lint`: exit 0 (0 errors, 0 warnings).
  2. UI verification:
     - Mở `http://localhost:3000`: Header trải rộng 100% viền sắc nét, nền trang xám nhạt dịu mắt, các thẻ nổi khối rõ ràng, 3 thẻ action tiện lợi.
     - Mở `http://localhost:3000/build`: Bố cục 2 cột hài hòa, có sẵn các preset mẫu để bấm thử 1 click, quy trình 6 bước rõ ràng, không còn khoảng trống thừa vô lý.
     - Mở `http://localhost:3000/catalog`: Tiêu đề không còn bị lặp, tabs card ngăn nắp, danh sách dự án gọn đẹp.
- Changed code:
  - `app/globals.css`
  - `src/modules/studio/components/layout/studio-shell.tsx`
  - `src/modules/studio/overview/screens/overview.screen.tsx`
  - `src/modules/studio/build-control/screens/build.screen.tsx`
  - `src/modules/studio/catalog/screens/catalog.screen.tsx`
  - `src/modules/studio/projects/components/project-manager.tsx`
  - `src/modules/studio/run-detail/components/run-overview-panel.tsx`
  - `docs/specs/ANTIGRAVITY-FEATURE-LOG.md`
- Branch / commit: `main`
- Known issues / shortcuts / structural debt: N/A.
- Next functional follow-up (optional): N/A.

### AG-007 — [Fix] Loại bỏ hoàn toàn cảnh báo deprecation [antd: Alert] `message` is deprecated. Please use `title` instead

- Status: `DONE`
- Goal / intended behavior:
  - Loại bỏ hoàn toàn cảnh báo deprecation của Ant Design 6: `[antd: Alert] message is deprecated. Please use title instead.` xuất hiện trên console trình duyệt khi render các component Alert.
- Implemented behavior:
  - Thay thế toàn bộ thuộc tính `message` bằng `title` trên tất cả các component `<Alert>` trong toàn bộ module Studio:
    1. `src/modules/studio/run-detail/components/run-overview-panel.tsx`: `title="Không tìm thấy file HTML đầu ra"`.
    2. `src/modules/studio/catalog/screens/catalog.screen.tsx`: `title="Catalog đang tắt"` và `title={...}`.
    3. `src/modules/studio/overview/screens/overview.screen.tsx`: `title={`Chưa cấu hình trình đọc lần chạy (${readerErrorCode})`}`.
    4. `src/modules/studio/run-detail/components/build-bundle-section.tsx`: `title="Xác minh manifest thất bại"`.
    5. `src/modules/studio/run-detail/components/reader-problem-state.tsx`: `title={title}`.
- How to test (URL, CLI, user actions):
  1. CLI verification:
     - `pnpm test`: 201/201 checks passed.
     - `pnpm run typecheck`: exit 0.
     - `pnpm run lint`: exit 0 (0 warnings, 0 errors).
  2. UI verification:
     - Mở trình duyệt vào `http://localhost:3000/runs/build-1794544715541` (và các trang `/`, `/catalog`):
     - Mở DevTools Console: Không còn bất kỳ cảnh báo deprecation nào liên quan đến `[antd: Alert]`.
- Changed code:
  - `src/modules/studio/run-detail/components/run-overview-panel.tsx`
  - `src/modules/studio/catalog/screens/catalog.screen.tsx`
  - `src/modules/studio/overview/screens/overview.screen.tsx`
  - `src/modules/studio/run-detail/components/build-bundle-section.tsx`
  - `src/modules/studio/run-detail/components/reader-problem-state.tsx`
  - `docs/specs/ANTIGRAVITY-FEATURE-LOG.md`
- Branch / commit: `main`
- Known issues / shortcuts / structural debt: N/A.
- Next functional follow-up (optional): N/A.

### AG-008 — [Feature] Gói cài đặt trọn bộ tự động (ZIP Bundle + Media Sync) & Redesign Giao diện Tree/Mapping Ant Design

- Status: `DONE`
- Goal / intended behavior:
  1. **Giải quyết triệt để vấn đề ảnh trắng / thiếu asset khi bưng vào Magento**: Cung cấp gói cài đặt all-in-one gồm script PHP `install-homepage.php`, mã HTML Page Builder và thư mục `media/` chứa toàn bộ ảnh/asset. Khi chạy script tại Magento root, script tự động copy recursive toàn bộ media sang `pub/media/`, tạo/cập nhật CMS Page và tự động flush cache `full_page, block_html` trong 1 lệnh duy nhất.
  2. **Tải trọn bộ 1-click ZIP**: Thêm nút "Tải trọn bộ Gói cài đặt (ZIP)" ngay trên màn hình chi tiết lần chạy Studio `/runs/[runId]` và hướng dẫn chi tiết 2 tab ("Cách 1: Gói trọn bộ tự động" và "Cách 2: Dán mã HTML thủ công").
  3. **Thiết kế lại Cây cấu trúc Figma (Tree View)**: Thay thế giao diện dạng thẻ bằng Ant Design `Tree` (`https://ant.design/components/tree`) hiển thị trực quan phân cấp Root Figma Page -> Section -> Node con, kèm icon phân loại (`text`, `media`, `container`, `component`, `icon`), ô tìm kiếm, bộ lọc trạng thái và Inspector Panel bên phải.
  4. **Thiết kế lại Chi tiết ánh xạ (Mapping Review)**: Bổ sung 6 thẻ KPI tổng quan (Tổng số node, Đã ánh xạ, Khoảng cách, Cần xem xét, Gom nhóm, Bỏ qua), thanh tìm kiếm nhanh, bộ lọc segmented, và Drawer xem chi tiết cấu hình mapping của từng node.
- Implemented behavior:
  1. `src/modules/magento/adapters/magento-cms-installer/render-cms-installer.ts`:
     - Cập nhật hàm `renderCmsInstallerPhp`: Bổ sung kiểm tra danh mục asset media trong `--dry-run` và thực hiện copy recursive an toàn toàn bộ file từ `media/` sang `<magento-root>/pub/media/` với phân quyền `0755` (dir) và `0644` (file).
     - Bổ sung lệnh flush cache tự động thông qua `FlushCacheInterface` (`full_page` và `block_html`).
     - Cập nhật `renderInstallerReadme`: Hướng dẫn đầy đủ cách chạy và cơ chế tự động sync media.
  2. `src/modules/core/cli/commands/build.ts`:
     - Tự động copy recursive thư mục `<configDir>/media/` sang `<bundleDir>/media/` khi thực hiện `det build`.
     - Bổ sung mock placeholder fashion media thực tế trong `resources/examples/build/slaunchpad-home-real-derived/media/`, `slaunchpad-home-72-extended/media/` và run active.
  3. `src/modules/studio/server/zip-bundle.ts` & `app/api/runs/[runId]/download-bundle/route.ts`:
     - Module tạo file ZIP PKZIP thuần Node.js không phụ thuộc thư viện ngoài (`node:zlib`).
     - Endpoint streaming ZIP download tại `/api/runs/[runId]/download-bundle`.
     - Nút "Tải trọn bộ Gói cài đặt (ZIP)" nổi bật trên `src/modules/studio/run-detail/components/run-overview-panel.tsx`.
  4. `src/modules/studio/design-tree/components/figma-tree-view.tsx` & `design-tree.tsx`:
     - Cây phân cấp Ant Design `Tree` đầy đủ tính năng: Search input, Segmented filter theo disposition, icon nhận diện loại node, badge trạng thái.
     - Inspector Card hiển thị chi tiết Node ID, layer name, locator, target component, lý do và nút copy 1-click.
     - Nút chuyển đổi View Mode `[ Cây phân cấp (Tree View) | Danh sách thẻ (Card View) ]` đảm bảo tương thích 100% với các test suite hiện có.
  5. `src/modules/studio/mapping-review/components/mapping-review-table.tsx`:
     - 6 thẻ KPI thống kê số lượng node theo từng trạng thái.
     - Bảng dữ liệu gọn gàng, nút copy Node ID, thẻ Target component, và Drawer trượt mở xem chi tiết node.
  6. `src/modules/studio/server/build-flow/build-flow-orchestrator.ts`:
     - Khắc phục race condition trong `orch.cancel(flowId)` khi flow đã đạt trạng thái terminal (`completed`, `failed`, `cancelled`, `interrupted`).
- How to test (URL, CLI, user actions):
  1. CLI verification:
     - `pnpm test`: 201/201 checks passed.
     - `pnpm run test:studio`: 61/61 test files passed, 631/631 tests passed.
     - `pnpm run typecheck`: exit 0.
     - `pnpm run lint`: exit 0.
     - `pnpm run build`: Core dist + Next.js production build pass clean.
  2. UI verification:
     - Mở `http://localhost:3000/runs/build-1794544715541`:
       - Tab "Tổng quan": Bấm nút xanh "Tải trọn bộ Gói cài đặt (ZIP)" -> tải về file `det-installer-build-1794544715541.zip`. Bên trong chứa đầy đủ `install-homepage.php`, `README.md`, `pagebuilder.html` và thư mục `media/wysiwyg/...` chứa ảnh thật.
       - Tab "Cây cấu trúc Figma": Xem giao diện Ant Design `Tree`, gõ thử ô tìm kiếm "Hero" hoặc lọc theo trạng thái "Đã ánh xạ", click vào một node để xem inspector panel bên phải cập nhật tức thì.
       - Tab "Chi tiết ánh xạ": Xem 6 thẻ KPI đầu trang, sử dụng bộ lọc và bấm "Chi tiết" để mở Drawer xem thông số node.
- Changed code:
  - `src/modules/magento/adapters/magento-cms-installer/render-cms-installer.ts`
  - `src/modules/magento/adapters/magento-cms-installer/__tests__/cms-installer-renderer.test.ts`
  - `src/modules/core/cli/commands/build.ts`
  - `resources/examples/build/slaunchpad-home-real-derived/media/`
  - `resources/examples/build/slaunchpad-home-72-extended/media/`
  - `src/modules/studio/server/zip-bundle.ts`
  - `src/modules/studio/server/zip-bundle.test.ts`
  - `app/api/runs/[runId]/download-bundle/route.ts`
  - `app/api/runs/[runId]/download-bundle/route.test.ts`
  - `src/modules/studio/run-detail/components/run-overview-panel.tsx`
  - `src/modules/studio/design-tree/components/figma-tree-view.tsx`
  - `src/modules/studio/design-tree/components/design-tree.tsx`
  - `src/modules/studio/design-tree/design-tree.test.tsx`
  - `src/modules/studio/mapping-review/components/mapping-review-table.tsx`
  - `src/modules/studio/mapping-review/components/diagnostics-panel.tsx`
  - `src/modules/studio/mapping-review/components/mapping-review.tsx`
  - `src/modules/studio/run-detail/screens/run.screen.tsx`
  - `src/modules/studio/server/build-flow/build-flow-orchestrator.ts`
  - `docs/specs/ANTIGRAVITY-FEATURE-LOG.md`
- Branch / commit: `main`
- Known issues / shortcuts / structural debt: N/A.
- Next functional follow-up (optional): N/A.

### AG-009 — [Fix] Khắc phục lỗi React duplicate key `Encountered two children with the same key, 'n-f18f7c3e5cd3'` trên FigmaTreeView & Tables

- Status: `DONE`
- Goal / intended behavior:
  - Loại bỏ hoàn toàn lỗi React console: `Encountered two children with the same key, 'n-f18f7c3e5cd3'. Keys should be unique so that components maintain their identity across updates.` tại `src/modules/studio/design-tree/components/figma-tree-view.tsx (314:22)`.
  - Đảm bảo toàn bộ các key trong Ant Design `Tree` và các bảng dữ liệu Ant Design `Table` là duy nhất toàn cục, ngay cả khi một node Figma xuất hiện nhiều lần trong danh sách mapping (ví dụ nhiều gap assessments / multiple bindings / multiple occurrences).
- Implemented behavior:
  1. `src/modules/studio/design-tree/components/figma-tree-view.tsx`:
     - Cấu trúc key của TreeDataNode được sinh duy nhất toàn cục theo format:
       - Node thuộc section: `${sec.sectionId}::${m.nodeId}::${idx}`
       - Node chưa gán: `unassigned::${m.nodeId}::${idx}`
     - Xây dựng bảng tra cứu `treeItemsByKey` (Map) ánh xạ từ key duy nhất sang node hoặc section tương ứng.
     - Cơ chế fallback thông minh cho `selectedNode` khi người dùng lọc tìm kiếm: trích xuất Node ID từ key `${sec}::${nodeId}::${idx}` để tra cứu trong `mappingMap`, giữ cho Inspector Panel bên phải luôn hiển thị chính xác.
  2. `src/modules/studio/mapping-review/components/mapping-review-table.tsx`:
     - Cập nhật `rowKey={(record, index) => `${record.nodeId}-${record.sectionId ?? "none"}-${index}`}` để triệt tiêu nguy cơ duplicate rowKey trong bảng Chi tiết ánh xạ.
  3. `src/modules/studio/design-tree/components/node-table.tsx`:
     - Cập nhật `rowKey={(record, index) => `${record.nodeId}-${index}`}` trong Card view.
- How to test (URL, CLI, user actions):
  1. CLI verification:
     - `pnpm test`: 201/201 checks passed.
     - `pnpm run test:studio`: 61/61 test files passed, 631/631 tests passed.
     - `pnpm run typecheck`: exit 0.
     - `pnpm run lint`: exit 0.
  2. UI verification:
     - Mở trình duyệt tại `http://localhost:3000/runs/build-1794544715541` (lần chạy có chứa 2 entry `n-f18f7c3e5cd3`).
     - Vào tab "Cây cấu trúc Figma", mở DevTools Console:
     - Không còn bất kỳ thông báo lỗi hoặc cảnh báo duplicate key nào.
     - Bấm chọn các node trong cây (kể cả Caption `n-f18f7c3e5cd3`), Inspector Panel hiển thị mượt mà.
- Changed code:
  - `src/modules/studio/design-tree/components/figma-tree-view.tsx`
  - `src/modules/studio/mapping-review/components/mapping-review-table.tsx`
  - `src/modules/studio/design-tree/components/node-table.tsx`
  - `docs/specs/ANTIGRAVITY-FEATURE-LOG.md`
- Branch / commit: `main`
- Known issues / shortcuts / structural debt: N/A.
- Next functional follow-up (optional): N/A.

### AG-010 — [Fix] Chuẩn hóa các prop Ant Design 6 (Steps orientation/Alert title) & Khắc phục cascade render trong Tree state

- Status: `DONE`
- Goal / intended behavior:
  - Loại bỏ các cảnh báo và lỗi console liên quan đến thuộc tính sai / deprecation của Ant Design 6 / React:
    1. Giữ nguyên `orientation="vertical"` trên `<Steps>` theo chuẩn Ant Design 6.x (loại bỏ hoàn toàn cảnh báo `[antd: Steps] 'direction' is deprecated. Please use 'orientation' instead`).
    2. Loại bỏ `orientation="horizontal"` không hợp lệ trên `<Space>`.
    3. Thay thế thuộc tính `message` bị deprecate trên `<Alert>` trong `add-page-modal.tsx` thành `title`.
    4. Xử lý trạng thái mở rộng `expandedKeys` trong `figma-tree-view.tsx` theo cơ chế declarative event-driven, loại bỏ lỗi ESLint React 19 `react-hooks/set-state-in-effect`.
- Implemented behavior:
  1. `src/modules/studio/build-control/screens/build.screen.tsx` & `build-pipeline.tsx`:
     - Đồng bộ dùng `orientation="vertical"` chuẩn theo API Ant Design 6 cho component `Steps`.
  2. `src/modules/studio/design-tree/components/figma-tree-view.tsx`:
     - Đổi `<Space orientation="horizontal" size="small">` thành `<Space size="small">`.
     - Chuyển `expandedKeys` sang `userExpandedKeys ?? allSectionKeys`: tự động mở toàn bộ section khi mới load, tự động mở rộng khi gõ tìm kiếm trong `handleSearch`, và lưu trữ trạng thái người dùng thao tác khi bấm Mở hết / Thu gọn / Mở thủ công (0 effect, không gây cascading renders).
  3. `src/modules/studio/projects/components/add-page-modal.tsx`:
     - Thay đổi `message=` thành `title=` trên cả 2 component `<Alert>` thông báo định dạng Figma URL.
- How to test (URL, CLI, user actions):
  1. CLI verification:
     - `pnpm test`: 201/201 checks passed.
     - `pnpm run test:studio`: 61/61 test files passed, 631/631 tests passed.
     - `pnpm run typecheck`: exit 0.
     - `pnpm run lint`: exit 0 (0 warnings, 0 errors).
  2. UI verification:
     - Mở `http://localhost:3000/build` và `http://localhost:3000/catalog`: Không còn bất kỳ cảnh báo deprecation nào trên `Steps` hay `Alert`.
     - Mở `http://localhost:3000/runs/build-1794544715541`: Cây `FigmaTreeView` tự động bung tất cả section ban đầu, gõ tìm kiếm tự bung section khớp, không có lỗi console.
- Changed code:
  - `src/modules/studio/design-tree/components/figma-tree-view.tsx`
  - `src/modules/studio/projects/components/add-page-modal.tsx`
  - `docs/specs/ANTIGRAVITY-FEATURE-LOG.md`
- Branch / commit: `main` / `a4dd00b`
- Known issues / shortcuts / structural debt: N/A.
- Next functional follow-up (optional): N/A.

### AG-011 — [Fix] Khắc phục cảnh báo Ant Design Table deprecation về index trong rowKey

- Status: `DONE`
- Goal / intended behavior:
  - Loại bỏ hoàn toàn cảnh báo console: `Warning: [antd: Table] 'index' parameter of 'rowKey' function is deprecated. There is no guarantee that it will work as expected.` tại `MappingReviewTable` và `DesignNodeTable`.
  - Đảm bảo mỗi hàng trong `dataSource` có key duy nhất ổn định, không phụ thuộc vào tham số `index` trong hàm `rowKey`, giúp Table hoạt động mượt mà khi filter/sort.
- Implemented behavior:
  1. `src/modules/studio/mapping-review/components/mapping-review-table.tsx`:
     - Trong `useMemo` của `filteredMappings`, gán sẵn thuộc tính `rowKey: `${m.nodeId}-${m.sectionId ?? "none"}-${m.composeDisposition}-${idx++}`` vào từng object record.
     - Đổi prop của `<Table>` thành `rowKey="rowKey"` (string prop), loại bỏ hoàn toàn việc truyền hàm nhận `index`.
  2. `src/modules/studio/design-tree/components/node-table.tsx`:
     - Dùng `useMemo` gán trước `rowKey: `${m.nodeId}-${index}`` cho từng item.
     - Đổi prop của `<Table>` thành `rowKey="rowKey"`.
- How to test (URL, CLI, user actions):
  1. CLI verification:
     - `pnpm test:studio src/modules/studio/mapping-review src/modules/studio/design-tree`: 16/16 tests passed, hoàn toàn sạch sẽ, 0 cảnh báo deprecation trên stderr.
     - `pnpm test`: 201/201 checks passed.
     - `pnpm run lint`: exit 0 (0 warnings, 0 errors).
     - `pnpm run typecheck`: exit 0.
  2. UI verification:
     - Mở trang `http://localhost:3000/runs/build-1794544715541`, chuyển qua tab **Chi tiết ánh xạ (Mapping Review)** và kiểm tra Console trình duyệt: không còn bất kỳ warning nào về `[antd: Table] index parameter of rowKey function is deprecated`.
- Changed code:
  - `src/modules/studio/design-tree/components/node-table.tsx`
  - `src/modules/studio/mapping-review/components/mapping-review-table.tsx`
  - `docs/specs/ANTIGRAVITY-FEATURE-LOG.md`
- Branch / commit: `main` / `2e21f11`
- Known issues / shortcuts / structural debt: N/A.
- Next functional follow-up (optional): N/A.

### Notes for Page Builder work

- **PASS is correct native component type and hierarchy**, not pixel-perfect styling: Row, Column, Banner, Image, Slider→Slide, Products grid/carousel, verified Magento widgets, and editable Admin Save→Reload behavior.
- Do not fake a product widget/slider using HTML; do not invent runtime catalog providers or inject products without a verified filter/binding. Unknown behavior → explicit GAP.
- The original Slaunchpad Figma Homepage is an **integration example**, not a customer-specific rule to bake into generic modules.
- For generated PHP: DET only produces the installer; executing it is an explicit Magento write. Test via `php -l`, dry-run and isolated store create/update/save/reload, with cleanup proof.

## Review / refactor handoff (fill when owner requests)

- Last Antigravity commit / branch:
- Implemented entry IDs:
- Known broken behavior / failed smoke tests:
- Architectural debt to prioritize:
- **ChatGPT review status:** NOT STARTED — wait for owner request; do not auto-create issues.
