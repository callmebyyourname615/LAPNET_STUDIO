# LAPNet Studio Portal

> Desktop PWA: ກົດ **ຕິດຕັ້ງແອັບ** ໃນ header ເພື່ອເປີດ Portal ເປັນໜ້າຕ່າງແອັບໃນຄອມພິວເຕີ. ຍັງຕ້ອງເປີດ server ແລະ ເຊື່ອມຕໍ່ລະບົບ. [ວິທີຕິດຕັ້ງ ແລະ ຂໍ້ຈຳກັດ](docs/PWA.md).

> Document workspace now uses the authenticated document API and persistent files. See [Document API, runtime and verification](docs/DOCUMENT_WORKSPACE.md) for current behavior; older phase notes below describe historical scope.

> ອັບເດດຫຼ້າສຸດ 10 ພະຈິກ 2026: Login ສຳເລັດເຂົ້າ Dashboard ໄດ້ທັນທີ. ຜູ້ໃຊ້ຂໍເອົາໜ້າບັງຄັບປ່ຽນລະຫັດຜ່ານຄັ້ງທຳອິດອອກ; ບັນຊີໃໝ່, reset ແລະ ບັນຊີເກົ່າບໍ່ຖືກກັ້ນດ້ວຍ mustChangePassword ອີກ. ປ່ຽນລະຫັດຜ່ານໄດ້ໃນ `/account` ຕາມຄວາມຕ້ອງການ (6–128 ຕົວ). Username/Password, session, CSRF ແລະ resource permissions ຍັງກວດຈິງຕາມເດີມ. ຂໍ້ຄວາມ first-login gate ເກົ່າຂ້າງລຸ່ມເປັນປະຫວັດ.


> ອັບເດດ 10 ພະຈິກ 2026: ຕາມຄຳຂໍຫຼ້າສຸດ ໜ້າ Login ກວດ Username/Password ກັບ API ຈິງໃນທຸກໂໝດແລ້ວ. ເອົາການກົດຂ້າມແບບ preview ອອກ; `?auth=preview`, `VITE_ENABLE_UI_PREVIEW` ແລະ browser flags ເກົ່າບໍ່ສາມາດຂ້າມ Login. ສ່ວນອະທິບາຍ preview ເກົ່າຂ້າງລຸ່ມເປັນປະຫວັດການພັດທະນາ.
> ໃນ local HTTP development ຮອງຮັບ `localhost`, `127.0.0.1`, `[::1]` ສະເພາະ port ທີ່ຕັ້ງ `APP_ORIGIN`; ຍັງກວດ CSRF ແລະ ປະຕິເສດ cross-site. Production ເຊື່ອໃຈສະເພາະ HTTPS origin ທີ່ຕັ້ງໄວ້.


ລະບົບພາຍໃນບໍລິສັດສຳລັບຕິດຕາມວຽກ, ເອກະສານ ແລະ ການຕິດຕໍ່ກັບບໍລິສັດພາຍນອກ. Frontend ແລະ API ເປັນຄົນລະແອັບໃນ pnpm workspace ດຽວກັນ.

## ສະຖານະ

Phase 01 ມີ backend/database ສຳລັບການພັດທະນາ. Phase 02 ເພີ່ມ Username/Password, session, ການຈັດການອົງກອນ ແລະ ສິດເຂົ້າເຖິງ. ໜ້າ Login ໃຊ້ component ທີ່ຜູ້ໃຊ້ໃຫ້ ແລະ ຂໍ້ຄວາມໜ້າເວັບເປັນພາສາລາວ.

ຂໍ້ມູນວຽກ/ໂພສ/ເອກະສານ/ບໍລິສັດໃນໜ້າທົດລອງຍັງບໍ່ເຊື່ອມ business API. ວຽກທີ່ເພີ່ມຍັງຫາຍເມື່ອໂຫຼດໜ້າໃໝ່; ການບັນທຶກວຽກແທ້ຈະເຮັດໃນ Phase 03.

## ສິ່ງທີ່ຕ້ອງມີ

- Node.js 24.19.0 ແລະ pnpm 10.18.0; version ລັອກໄວ້ໃນ `.mise.toml`.
- PostgreSQL 18 server/client tools ສຳລັບການພັດທະນາໃນເຄື່ອງ, ຫຼື Docker ສຳລັບຂັ້ນຕອນ container.

## ເລີ່ມໃຊ້ໃນເຄື່ອງ

```sh
pnpm install --frozen-lockfile
pnpm dev:db
pnpm db:generate
pnpm db:migrate
pnpm build
pnpm db:seed
pnpm auth:bootstrap
```

`dev:db` ສ້າງ PostgreSQL ແຍກໃນ `.local/postgres` ເທິງ `127.0.0.1:55432`. ບໍ່ແຕະຖານຂໍ້ມູນໃນ port 5432, 18503 ຫຼື 18513 ຂອງໂປຣເຈັກອື່ນ. ລະຫັດ database ຖືກສ້າງແບບສຸ່ມ ແລະ ເກັບໃນ `.env` ສ່ວນຕົວ. ຢ່າປ່ຽນໄຟລ໌ນີ້ຫຼັງສ້າງ database ໂດຍບໍ່ມີຂັ້ນຕອນປ່ຽນ credentials.

ຮັນສອງຄຳສັ່ງນີ້ໃນ terminal ແຍກກັນ:

```sh
pnpm dev:api
PORT=5173 FIGMA_DEV_SERVER_HOST=127.0.0.1 pnpm dev
```

ເວັບ: http://127.0.0.1:5173/sign-in
API version: http://127.0.0.1:5173/api/v1/version
ກວດ API/database: http://127.0.0.1:3100/health/ready

ບັນຊີເລີ່ມຕົ້ນແມ່ນ `admin`; ລະຫັດຊົ່ວຄາວຢູ່ `.local/admin-access.json` ແລະ ຕ້ອງປ່ຽນໃນການເຂົ້າໃຊ້ຄັ້ງທຳອິດ. ຫ້າມເກັບ `.env`, `.local` ຫຼື ລະຫັດຈິງໃນ Git.

ຢຸດແອັບດ້ວຍ Ctrl+C. ຢຸດ database ຂອງໂປຣເຈັກດ້ວຍ `pnpm db:stop`; ຮັນໃໝ່ດ້ວຍ `pnpm dev:db`.

## ໂຄງສ້າງ

```text
src/                         React + TypeScript + Vite
src/components/ui/           component ຕາມໂຄງສ້າງ shadcn
src/features/identity/       Login, ບັນຊີ ແລະ ອົງກອນ
src/i18n/lo.ts              ຂໍ້ຄວາມພາສາລາວ
apps/api/src/                NestJS TypeScript API
apps/api/test/               ການທົດສອບ API ແລະ ສິດ
packages/contracts/          API contracts ແບບ ESM/CJS
packages/database/           Prisma, SQL migrations ແລະ seed
scripts/                     ເຄື່ອງມື TypeScript
infra/                       Docker, Compose ແລະ Nginx
```

API ມີ package, build ແລະ process ຂອງຕົນເອງ. ບໍ່ໄດ້ໃຊ້ Next.js. ການຢູ່ repo ດຽວກັນບໍ່ໄດ້ລວມ runtime ຂອງສອງແອັບ.

## ການກວດສອບ

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm test:identity
pnpm api:openapi
```

`test:identity` ໃຊ້ database ຊົ່ວຄາວແຍກ ແລະ ບໍ່ຂຽນທັບຂໍ້ມູນພັດທະນາຫຼັກ. OpenAPI ຢູ່ `docs/openapi.json`; ບໍ່ມີ Swagger administration route ເປີດສາທາລະນະ.

```sh
pnpm db:verify
node scripts/dev-database.ts restart
pnpm db:backup
pnpm db:restore-check
pnpm db:verify --after-restart
```

ຄຳສັ່ງເຫຼົ່ານີ້ກວດ privileges, ການເກັບຂໍ້ມູນຫຼັງ restart ແລະ restore ໃສ່ database ຊົ່ວຄາວ. Backup ໃນ `.local` ບໍ່ແມ່ນສຳເນົາອິດສະຫຼະຈາກອຸປະກອນຫຼັກ.

## ເອກະສານ

- [Audit Logs — ປະຫວັດການໃຊ້ງານ](docs/AUDIT_LOGS.md)
- [ສະຖານະ Phase 02](docs/PHASE_02_STATUS.md)
- [ຄູ່ມືບັນຊີ ແລະ ສິດ](docs/AUTHENTICATION.md)
- [ການນຳ component Login ມາໃຊ້](docs/LOGIN_INTEGRATION.md)
- [ຫຼັກຖານ Phase 01](docs/PHASE_01_STATUS.md)
- [ການຕິດຕັ້ງພື້ນຖານ](docs/OPERATIONS.md)

MFA ຈະເພີ່ມພາຍຫຼັງຕາມທີ່ໄດ້ຕົກລົງ. Google/GitHub ຍັງບໍ່ເປີດໃຊ້. Docker, HTTPS ແລະ ການກູ້ຄືນໃນ server ຈິງຍັງຕ້ອງທົດສອບກ່ອນ production.

## ການເຂົ້າລະບົບ ແລະ ວຽກ

Login ທຸກໜ້າຕ້ອງໃຊ້ username/password ຂອງບັນຊີຈິງ ທັງ development ແລະ production. Query parameters ແລະ browser flags ບໍ່ສາມາດຂ້າມ authentication. ວຽກຢູ່ `/tasks` ບັນທຶກຜ່ານ API/PostgreSQL; ອ່ານ [ສະຖານະ Phase 03A](docs/PHASE_03A_STATUS.md).

## ບັນຊີສ່ວນຕົວ

`/settings` ແກ້ໄຂຂໍ້ມູນທົ່ວໄປ, ປ່ຽນລະຫັດຜ່ານ ແລະ ປັບແຕ່ງຮູບໂປຣໄຟລ໌/ຮູບປົກໃນ Image Studio ກ່ອນບັນທຶກ. ອ່ານ [Account and Image Studio](docs/ACCOUNT_MENU.md). ທົດສອບດ້ວຍ `pnpm test:account`.
