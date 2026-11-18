# Phase 03A — ວຽກທີ່ບັນທຶກໃນລະບົບ

> ອັບເດດ 18 ພະຈິກ 2026: workflow Host + ເຊີນຄົນ/ພະແນກ + ຮ່ວມອັບເດດວຽກ ມີກົດໃໝ່ຕາມ [TASK_HOST_TEAM.md](TASK_HOST_TEAM.md). ກົດໃໝ່ແທນ checkbox ແບ່ງປັນ, ສິດປ່ຽນທີມ ແລະການຖອນຄົນໃນບົດລາຍງານເກົ່າຂ້າງລຸ່ມ. ການແກ້ Portal background refresh ຢູ່ [PORTAL_REFRESH.md](PORTAL_REFRESH.md).

> ອັບເດດ 10 ພະຈິກ 2026: ຕາມຄຳຂໍຫຼ້າສຸດ ໜ້າ Login ກວດ Username/Password ກັບ API ຈິງໃນທຸກໂໝດແລ້ວ. ເອົາການກົດຂ້າມແບບ preview ອອກ; `?auth=preview`, `VITE_ENABLE_UI_PREVIEW` ແລະ browser flags ເກົ່າບໍ່ສາມາດຂ້າມ Login. ສ່ວນອະທິບາຍ preview ເກົ່າຂ້າງລຸ່ມເປັນປະຫວັດການພັດທະນາ.
> ໃນ local HTTP development ຮອງຮັບ `localhost`, `127.0.0.1`, `[::1]` ສະເພາະ port ທີ່ຕັ້ງ `APP_ORIGIN`; ຍັງກວດ CSRF ແລະ ປະຕິເສດ cross-site. Production ເຊື່ອໃຈສະເພາະ HTTPS origin ທີ່ຕັ້ງໄວ້.


ວັນທີ: 10 ພະຈິກ 2026. ຂອບເຂດ: ພັດທະນາ ແລະ ທົດສອບໃນເຄື່ອງ; ຍັງບໍ່ແມ່ນ production acceptance.

## ຟັງຊັນ

- ສ້າງ, ເບິ່ງ, ແກ້ໄຂ ແລະ ເກັບວຽກເຂົ້າຄັງຜ່ານ API ແລະ PostgreSQL.
- ເຈົ້າຂອງ, ພະແນກເຈົ້າຂອງ, ຜູ້ຮັບຜິດຊອບຫຼັກໜຶ່ງຄົນ, ຜູ້ຮ່ວມວຽກສູງສຸດ 25 ຄົນ, ລາຍລະອຽດ, ຄວາມສຳຄັນ ແລະ ວັນຄົບກຳນົດ.
- ເລກ `TSK-...` ອອກໂດຍ sequence ຂອງຖານຂໍ້ມູນ; URL ໃຊ້ UUID. ເລກອາດຂ້າມເມື່ອ transaction ບໍ່ສຳເລັດ.
- ມຸມມອງທັງໝົດທີ່ມີສິດ, ວຽກຂອງຂ້ອຍ, ຂ້ອຍເປັນຜູ້ສ້າງ, ຂ້ອຍເປັນຜູ້ມອບໝາຍຫຼ້າສຸດ, ພະແນກຂອງຂ້ອຍ; ກັ່ນຕອງສະຖານະ/ຄວາມສຳຄັນ/ພະແນກ/ກຳນົດເວລາ ແລະ ຄົ້ນຫາຫົວຂໍ້, ລາຍລະອຽດ ຫຼື ເລກວຽກ.
- ກວດສິດກ່ອນນັບລາຍການ ແລະ ແບ່ງໜ້າ; cursor ອີງວັນສ້າງ ແລະ UUID ທີ່ບໍ່ປ່ຽນແປງ.
- ການແກ້ໄຂ/ປ່ຽນສະຖານະ/archive ຕ້ອງສົ່ງ revision. ຖ້າມີຄົນແກ້ໄຂກ່ອນ ຈະໄດ້ HTTP 409; ບໍ່ເຮັດ automatic retry ທີ່ຂຽນທັບຂໍ້ມູນ.
- ເກັບ snapshot ທຸກ revision: ຫົວຂໍ້, ລາຍລະອຽດ, ຜູ້ຮັບຜິດຊອບ/ຜູ້ຮ່ວມວຽກ, ສະຖານະ, ຄວາມສຳຄັນ, ວັນຄົບກຳນົດ, ຜູ້ປ່ຽນ ແລະ ເຫດຜົນ. ບັນຊີ runtime ບໍ່ມີສິດແກ້ໄຂ/ລຶບ/ລ້າງຕາຕະລາງປະຫວັດ.
- ປະຫວັດທຸລະກິດແຍກຈາກ audit ທາງເຕັກນິກ. Audit ບໍ່ສຳເນົາຫົວຂໍ້/ລາຍລະອຽດ.
- ພາບລວມວຽກຂອງບັນຊີຈິງອ່ານຈາກ API. ການລາຍງານຂັ້ນສູງຍັງເປັນ Phase 06.

## ກົດສິດເລີ່ມຕົ້ນ

1. ບັນຊີ active ທີ່ເປັນສະມາຊິກພະແນກປັດຈຸບັນ ຫຼື ມີ `resource_editor` ຂອບເຂດພະແນກ ສາມາດສ້າງວຽກໃນພະແນກນັ້ນ. ຕ້ອງເປັນພະແນກ active.
2. `portal_admin` ຈັດການລະບົບໄດ້ ແຕ່ບໍ່ອ່ານວຽກທຸກຄົນ ຫຼື ສ້າງໃນພະແນກທີ່ບໍ່ມີສິດໂດຍອັດຕະໂນມັດ. ຖ້າ admin ຈະສ້າງວຽກ ໃຫ້ກຳນົດ membership ໃຫ້ບັນຊີຕົນເອງກ່ອນ.
3. ເລືອກຜູ້ຮັບຜິດຊອບ/ຜູ້ຮ່ວມວຽກບໍ່ປ່ຽນ ACL ໂດຍອັດຕະໂນມັດ. ຖ້າເລືອກ checkbox ແບ່ງປັນ ຜູ້ມີ `manage_access` ຈະອອກສິດ `view` ແລະ `edit` ໃຫ້ຄົນທີ່ເລືອກໃນ transaction ດຽວກັນ. ຖ້າບໍ່ເລືອກ ຄົນເຫຼົ່ານັ້ນຕ້ອງມີສິດເບິ່ງແລ້ວ.
4. ຜູ້ມີ `edit` ປ່ຽນລາຍລະອຽດ, ຜູ້ຮັບຜິດຊອບ, ຜູ້ຮ່ວມວຽກ, ວັນຄົບກຳນົດ ແລະ ສະຖານະໄດ້. ບໍ່ສາມາດອອກສິດໃໝ່ໄດ້ຖ້າບໍ່ມີ `manage_access`.
5. ການເອົາຄົນອອກຈາກຜູ້ຮ່ວມວຽກບໍ່ຖອນສິດເກົ່າ. ໃຊ້ແຜງແບ່ງປັນເພື່ອຖອນສິດ; ສິດຈາກພະແນກ ຫຼື role ອື່ນຍັງຖືກກວດຕາມ Phase 02.
6. ປະຫວັດ, detail, list ແລະ count ໃຊ້ ACL ປັດຈຸບັນ. ຜູ້ທີ່ຖືກຖອນສິດບໍ່ສາມາດອ່ານ snapshot ເກົ່າໄດ້.
7. Archive ຕ້ອງມີ `manage_access`. ວຽກທີ່ archive ບໍ່ປາກົດໃນ API ໃຊ້ງານ; ຂໍ້ມູນ ແລະ history ຍັງຢູ່ໃນຖານຂໍ້ມູນ. ຍັງບໍ່ມີ restore/archive browser ຫຼື permanent delete.
8. ພະແນກເຈົ້າຂອງບໍ່ປ່ຽນໃນ 03A. ການໂອນວຽກຂ້າມພະແນກຕ້ອງອອກແບບ ACL/history ແຍກກ່ອນເພີ່ມ.

ກົດເລີ່ມຕົ້ນນີ້ຕ້ອງທົບທວນກັບບໍລິສັດກ່ອນ production. ຄົ້ນຫາຜູ້ໃຊ້ດ້ວຍຢ່າງນ້ອຍ 2 ຕົວ, ສົ່ງຄືນສູງສຸດ 25 ລາຍການ; ເປີດສະເພາະຊື່/UUID/ສະຖານະ ບໍ່ສົ່ງ email, password ຫຼື role ສ່ວນຕົວ.

## ສະຖານະ ແລະ ເວລາ

- ວຽກໃໝ່ເລີ່ມ `todo`.
- `todo`, `in_progress`, `blocked` ປ່ຽນໄປສະຖານະ active ອື່ນ, `done` ຫຼື `cancelled` ໄດ້. ບໍ່ຮັບການປ່ຽນເປັນສະຖານະເກົ່າຊ້ຳ.
- `blocked` ແລະ `cancelled` ຕ້ອງມີເຫດຜົນ. `done`/`cancelled` ເປີດຄືນໄດ້ສະເພາະເປັນ `todo` ພ້ອມເຫດຜົນ.
- due date ເປັນ SQL `DATE`, ບໍ່ແມ່ນ timestamp. ກວດວັນຈິງ; ບໍ່ຮັບ 30 ກຸມພາ ຫຼື ວັນທີຜິດຮູບແບບ.
- ມື້ນີ້/ເກີນກຳນົດອີງ `Asia/Vientiane`. `done`/`cancelled` ບໍ່ເປັນ overdue. Timestamp ຖານຂໍ້ມູນຍັງເປັນ UTC. ຈໍພາສາລາວລະບຸ Gregorian calendar ຊັດເຈນ ເພື່ອໃຫ້ປີ 2026 ບໍ່ປ່ຽນເປັນປີ Buddhist ຕາມ locale fallback.
- ຫົວຂໍ້/ລາຍລະອຽດເປັນ plain text. React ສະແດງເປັນຂໍ້ຄວາມ; ບໍ່ຮັນ HTML/script ທີ່ປ້ອນ.

## API

| Route | ການເຮັດວຽກ |
|---|---|
| `GET /api/v1/tasks` | ລາຍການ/ຕົວກັ່ນຕອງ/total/cursor |
| `GET /api/v1/tasks/options` | ພະແນກທີ່ສ້າງວຽກໄດ້ ແລະ ຄົ້ນຫາຄົນ |
| `POST /api/v1/tasks` | ສ້າງວຽກ ແລະ history ໃນ transaction |
| `GET /api/v1/tasks/:id` | detail ແລະ capabilities ຈາກ server |
| `PATCH /api/v1/tasks/:id` | ບັນທຶກ field ຈາກຟອມທັງຊຸດ ພ້ອມ revision |
| `POST /api/v1/tasks/:id/transitions` | ປ່ຽນສະຖານະ/ເປີດຄືນ |
| `POST /api/v1/tasks/:id/archive` | ເກັບເຂົ້າຄັງ ພ້ອມ revision |
| `GET /api/v1/tasks/:id/history` | snapshot ແຕ່ລະ revision, pagination ດ້ວຍ `before` |
| `/api/v1/resources/:id/grants` | ນຳ API ແບ່ງປັນ/ຖອນສິດຈາກ Phase 02 ມາໃຊ້ |

ທຸກ mutation ກວດ session, ບັນຊີ, Origin ແລະ CSRF. ທຸກ body/query ຈຳກັດຂະໜາດ ແລະ ປະຕິເສດ field ທີ່ບໍ່ຮູ້ຈັກ. ລາຍການເລີ່ມຕົ້ນ 25, ສູງສຸດ 100.

## ການເປີດໃຊ້ທ້ອງຖິ່ນ

- ເປີດ `http://127.0.0.1:5173/sign-in?auth=real`, Login ດ້ວຍບັນຊີຈິງ ແລ້ວໄປ `/tasks`.
- development ຈື່ຕົວເລືອກ real mode ໃນ sessionStorage ເພື່ອໃຫ້ refresh/direct URL ຍັງກວດ server session. ເປັນ flag UI, ບໍ່ແມ່ນ token ຫຼື ສິດ.
- ກັບໂໝດຕົວຢ່າງດ້ວຍ `/sign-in?auth=preview`. ໂໝດ preview ຍັງເຂົ້າໄດ້ທັນທີ ແລະ ໃຊ້ວຽກຕົວຢ່າງທີ່ບໍ່ບັນທຶກໃນ API.
- production ບໍ່ເປີດ preview.

## Migration, ການທົດສອບ ແລະ recovery

Migration: `202611100001_tasks` ເພີ່ມ `tasks`, `task_collaborators`, `task_revisions`, enum/index/constraint ແລະ runtime sequence privilege. ມີ backup ກ່ອນ migrate. `202611100002_task_assigner` ເພີ່ມຜູ້ມອບໝາຍຫຼ້າສຸດ ແລະ backfill ຈາກ history ທີ່ assignee ປ່ຽນຈິງ; ການແກ້ໄຂ metadata ອື່ນບໍ່ປ່ຽນຜູ້ມອບໝາຍ.

ຄຳສັ່ງ: `pnpm db:generate`, `pnpm build:backend`, `pnpm db:migrate`, `pnpm test:tasks`, `pnpm test:identity`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm api:openapi`.

`pnpm test:tasks` ໃຊ້ driver ຖານຂໍ້ມູນທົດສອບເກົ່າ ເພື່ອສ້າງ/ລຶບສະເພາະ disposable DB; ບໍ່ລຶບຂໍ້ມູນ `lapnet_dev`. ທົດສອບ ACL, CSRF, rollback, ວັນທີ, ແບ່ງປັນ/ຖອນສິດ, concurrent edits, revision history, pagination, archive ແລະ API restart.

`pnpm db:backup` ຈັບຕາຕະລາງວຽກ, ປະຫວັດ, resources ແລະ grants ດ້ວຍ. `pnpm db:restore-check` ກວດ checksum/count ໃນ disposable DB. Backup ທ້ອງຖິ່ນຍັງບໍ່ແມ່ນ backup ອິດສະຫຼະສຳລັບ production.

Forward fix: ຢ່າລຶບ migration ທີ່ຖືກໃຊ້ແລ້ວ ຫຼື drop ຕາຕະລາງເພື່ອ rollback. ຖ້າຈະ rollback app ໃຫ້ເກັບຕາຕະລາງໃໝ່ໄວ້. ທົດສອບ restore ໃນ DB ແຍກກ່ອນໃຊ້ເປັນ recovery ຈິງ.

## ຂອບເຂດຕໍ່ໄປ

03B: Feed, comments, mentions, outbox/worker ແລະ notifications. 04: ເອກະສານ/ໄຟລ໌. 05: Company A/contacts/timeline. ຍັງບໍ່ເປີດ upload ຊົ່ວຄາວ ຫຼື ສ້າງ company ປອມໃນ task ຈິງ. Phase 03 ທັງໝົດຍັງບໍ່ສຳເລັດຈົນກວ່າ 03B ຈະຜ່ານ.

Production ຍັງຕ້ອງຢືນຢັນກົດທຸລະກິດ/employee-directory policy, host deployment, HTTPS, ອຸປະກອນ backup ແຍກ ແລະ ການວັດ load ໃນ server ຈິງ.

## ຜົນກວດທ້ອງຖິ່ນ — 10 ພະຈິກ 2026

| ລາຍການ | ຜົນ |
|---|---|
| Tasks integration | 15 checks ຜ່ານ ໃນ disposable DB; ລວມ suite ຫຼັກ |
| Identity regression | 15 checks ຜ່ານ ໃນ disposable DB; ລວມ suite ຫຼັກ |
| Foundation | 8 ຜ່ານ; DB suites ຖືກທົດສອບແຍກດ້ວຍ driver ຂ້າງເທິງ |
| Browser | 26 assertions ຜ່ານ: ສ້າງ/ແກ້ໄຂ/refresh/history/concurrent conflict/share/revoke/archive; ບໍ່ມີ page exception |
| Responsive | Tasks list/detail ບໍ່ລົ້ນແນວນອນ; detail 320/375/768/1440px ແລະ list 320/768/1440px; ກວດຮູບ mobile/desktop |
| Build/static checks | Web/API build, TypeScript, lint, format ແລະ OpenAPI ຜ່ານ |
| Recovery | Backup `2026-11-10T04-08-34-678Z` restore ເຂົ້າ disposable DB ຜ່ານ: checksum, counts, task/resource links, snapshot ສະບັບຫຼ້າສຸດ ແລະ number sequence/ຜູ້ມອບໝາຍທີ່ກົງກັບ history |

Browser QA ໃຊ້ບັນຊີ/ວຽກທົດສອບທີ່ລະບຸ `QA03`; ວຽກຖືກ archive ແລະ ບັນຊີທົດສອບຖືກລະງັບ/ຖອນ session ຫຼັງກວດ. ບໍ່ປ່ຽນລະຫັດຜ່ານ admin ຫຼື ນຳຂໍ້ມູນຈິງມາທົດສອບ.

ຫຼັກຖານ browser ຢູ່ `output/playwright/phase03-browser-results.json` ແລະ screenshots `phase03-detail-*` / `phase03-list-*` (ignored artifacts). ການກວດນີ້ບໍ່ແມ່ນ load benchmark ຫຼື production release gate.

Development preview/production guard regression: 7 assertions ຜ່ານ; preview ສ້າງວຽກທ້ອງຖິ່ນໄດ້ໂດຍບໍ່ເອີ້ນ Tasks API, real-mode ຊະນະ flag preview, production ບໍ່ຮັບ query/storage flag ເພື່ອຂ້າມ Login. ຫຼັກຖານ: `output/playwright/phase03-preview-results.json`.
