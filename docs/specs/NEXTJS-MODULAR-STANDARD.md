# Next.js Modular Architecture — Coding Standard (Owner-adopted 2026-11-12)

> Owner direction (2026-11-12): this standard is the **default coding convention** for all
> Next.js (App Router + TypeScript) code in this repository. New code follows it from the
> start; existing code is refactored in a controlled way, never rewritten needlessly.
> Simplicity, maintainability, consistency and Next.js best practices win. Receipt of the
> applying pass: [RECEIPT-CHORE-STUDIO-MODULAR-STANDARD.md](../converter/RECEIPT-STUDIO-MODULAR-STANDARD.md).

## Repo adaptation (how this standard lands HERE)

- **Scope.** This standard governs the Next.js surface only: `app/` (routing shell) and the
  Studio UI module `src/modules/studio/**`. The headless engine (`src/modules/core`, `src/modules/{figma,magento,knowledge}`,
  module-owned adapters) is a deterministic CLI, not a Next.js feature module — it stays
  under the [68] module doctrine and its gate-locked receipts.
- **Layer mapping.** The standard's `services/` + `repositories/` roles live in ONE
  server-only seam here: `src/modules/studio/server/**` (readers, catalogue, runner;
  every file carries `import "server-only"`). `schemas/types` SSOT is
  `resources/schemas/**` (engine-validated) with derived client read models in
  `src/modules/studio/shared/contracts`. `actions/` roles are Route Handlers under
  `app/api/**` (thin; they delegate to `server/`). `permissions/` is deliberately absent —
  single local operator tool, auth is a future gate.
- **Screens.** Page-level composition lives in `src/modules/studio/{lane}/screens/*.screen.tsx`;
  `app/**/page.tsx` keeps only routing, metadata, `connection()`, request-time reads and
  failure mapping. Feature lanes sit DIRECTLY under `src/modules/studio/` (no nested
  `modules/` level inside the studio module): `overview`, `build-control`, `catalog`,
  `run-detail`, `conversions`, `design-tree`, `mapping-review`, `preview`, `artifacts`,
  `agent`. Each lane is one standard module (index.ts public API, components/, screens/, types/…).
- **Deviation kept on purpose.** Tests stay co-located with their code (`*.test.tsx`
  beside the component, suites in module `__tests__/`) per the [68] doctrine — the
  standard's `__tests__/`-only rule is satisfied in spirit (tests beside code, kebab
  `*.test.*` naming). `shared/contracts/index.ts` keeps three scoped `export *` re-exports
  of its own sibling contract files (a namespace barrel, not sprawl).
- **Formatting.** Prettier governs formatting: `tabWidth: 3` (`.prettierrc.json`,
  `.editorconfig`); run `pnpm run format` before committing. `pnpm run format:check` in
  review.
- **Gates are local.** The repo has NO GitHub Actions workflow (Owner removed
  `.github/workflows/validate.yml` on 2026-11-12): `pnpm test` (contract suite),
  `pnpm run test:studio`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run build` are run
  locally / by the coordinating agent on the exact head before any review claim.

## 1. Standard Module Structure

Áp dụng cấu trúc sau cho mỗi module:

```text
src/
├── app/
│   ├── (dashboard)/
│   │   └── products/
│   │       ├── page.tsx
│   │       ├── loading.tsx
│   │       ├── error.tsx
│   │       ├── new/page.tsx
│   │       └── [id]/page.tsx
│   └── api/
│       └── products/
│           └── route.ts
│
├── modules/
│   └── products/
│       ├── index.ts
│       ├── server.ts
│       │
│       ├── components/
│       │   ├── ui/ …
│       │   ├── table/ …
│       │   ├── form/ …
│       │   └── detail/ …
│       ├── screens/
│       │   ├── list.screen.tsx
│       │   ├── create.screen.tsx
│       │   └── detail.screen.tsx
│       ├── hooks/ …
│       ├── actions/ …
│       ├── services/ …
│       ├── repositories/ …
│       ├── schemas/ …
│       ├── types/ …
│       ├── mappers/ …
│       ├── permissions/ …
│       ├── constants/ …
│       └── __tests__/ …
│
├── shared/
│   ├── components/ui/ · hooks/ · lib/ · types/ · utils/
└── config/
```

Đây là cấu trúc tham chiếu đầy đủ, **không bắt buộc tạo tất cả file hoặc thư mục**. Chỉ
tạo khi chức năng thực sự cần (chuẩn mục 10: không refactor phần đang đúng chỉ để áp
dụng cấu trúc máy móc).

## 2. Naming Conventions

- `kebab-case` cho tên file và thư mục.
- Không lặp tên module khi ngữ cảnh thư mục đã rõ.
- Actions: `create.action.ts`, `update.action.ts`, `delete.action.ts`.
- Screens: `list.screen.tsx`, `create.screen.tsx`.
- Hooks: `use-filters.ts`, `use-form.ts`.
- Services: `product.service.ts`. Repositories: `product.repository.ts`.
- Schemas: `product.schema.ts`. Types: `product.types.ts`.
- Tests: `service.test.ts`.

Đúng: `modules/products/actions/create.action.ts`
Sai: `modules/products/actions/create-product.action.ts`

## 3. Architecture Rules

### Routing

`app/` chỉ chứa routing, layouts, metadata, loading/error boundaries và phần kết nối cần
thiết tới module. Không nhét business logic phức tạp vào `page.tsx`.

### Components

- Component riêng của module nằm trong `modules/{module}/components/`.
- UI dùng chung thực sự nằm trong `shared/components/ui/`.
- Không tạo bản sao Button/Input/Select nếu shared UI đã đáp ứng.
- Component nhỏ, dễ tái sử dụng, trách nhiệm rõ ràng.
- Không để UI trực tiếp truy cập database.

### Screens

- Screens chịu trách nhiệm tổ chức các components thành màn hình hoàn chỉnh.
- Tách UI presentation khỏi business logic.
- Không tạo screen riêng nếu chỉ làm tăng một tầng wrapper không cần thiết.

### Actions

- Sử dụng Server Actions cho mutations phù hợp (trong repo này hiện dùng Route Handlers
  under `app/api/**` — chuyển sang Server Actions chỉ khi có gate riêng, không phải phần
  chuẩn hóa).
- Validate input trên server. Kiểm tra authentication và authorization (future gate —
  local operator tool).
- Gọi service để thực hiện nghiệp vụ. Không nhét business logic phức tạp vào action.

### Services / Repositories

- Services chứa business logic, điều phối persistence, không phụ thuộc React/UI, dễ unit
  test. Repositories đóng gói persistence, không chứa presentation logic.
- Trong repo này cả hai sống trong seam `server/` (server-only) — xem Repo adaptation.

### Schemas / Types

- Sử dụng Zod hoặc validation library đang có trong dự án.
- Tái sử dụng inferred types khi phù hợp. Không khai báo DTO/interfaces trùng lặp.
- Không đưa ORM entities hoặc dữ liệu nhạy cảm trực tiếp xuống client.

### Hooks

- Chỉ chứa React/client-side logic; không import repository, DB client hoặc server-only
  modules. Không tạo custom hook nếu không mang lại lợi ích thực tế.

### Index Files

- `index.ts` là public API của module; `server.ts` dành cho server-only exports.
- Chỉ export những gì external modules cần; không `export *` tràn lan.
- Không tạo `index.ts` ở tất cả thư mục; không làm client import gián tiếp server-only
  code; dùng `import 'server-only'` cho module server nhạy cảm.

### Dependencies

- Ưu tiên import qua public API khi module khác cần sử dụng.
- Internal module dùng relative imports hoặc path aliases nhất quán.
- Không circular dependencies; không import internal implementation của module khác.
- `shared/` không phụ thuộc vào feature modules.
- Không chuyển mọi logic sang shared khi chưa có nhu cầu tái sử dụng thực tế.

## 4. Next.js Requirements

- App Router; Server Components mặc định; chỉ `'use client'` khi thực sự cần.
- Server Actions, Route Handlers và repositories tuân thủ server boundary.
- Kiểm tra auth/permissions tại server entry points (future gate).
- Có loading, error và empty states khi phù hợp.
- Áp dụng caching/revalidation theo hành vi dữ liệu thực tế (repo: mọi route Studio là
  blocking request-time qua `connection()` + `export const instant = false`).
- Tránh unnecessary client-side fetching; không tạo Route Handler chỉ để gọi nội bộ từ
  Server Component khi có thể gọi service trực tiếp.

## 5. UI Standards

- Sử dụng UI library hiện tại của dự án — ở đây là **stock Ant Design 6 light**
  ([61]: no `ConfigProvider` theme, no token overrides, light-only invariant).
- Ưu tiên component mặc định của thư viện; không tự xây lại những component đã có.
- Giữ layout đồng nhất: form, table, modal, drawer, filter, tabs, pagination.
- Responsive và accessible; tránh wrapper/div lồng nhau không cần thiết.
- Không hardcode styles rải rác; không để một component chứa quá nhiều trách nhiệm.

## 6. Refactoring Existing Code

1. Inspect toàn bộ project structure và conventions hiện tại.
2. Xác định những module chưa tuân thủ.
3. Lập dependency map trước khi di chuyển file.
4. Refactor theo từng module, giữ nguyên functional behavior.
5. Cập nhật imports, exports và tests.
6. Loại bỏ duplicate components và unused files khi đã xác minh an toàn.
7. Chạy typecheck, lint, tests và production build.
8. Kiểm tra server/client boundaries, circular imports và public APIs.
9. Không thay đổi nghiệp vụ, database schema hoặc UI ngoài phạm vi chuẩn hóa.
10. Không refactor các phần đang đúng chỉ để áp dụng cấu trúc một cách máy móc.

## 7. Definition of Done

- Module boundaries rõ ràng; naming nhất quán.
- Không duplicate logic không cần thiết; không circular dependencies.
- Không vi phạm server/client boundary; không unnecessary abstraction.
- Không tạo file/thư mục rỗng chỉ để khớp cấu trúc mẫu.
- TypeScript/typecheck PASS · ESLint PASS · Tests PASS · Production build PASS.
- Không regression chức năng. Receipt ghi evidence theo chuẩn repo.
