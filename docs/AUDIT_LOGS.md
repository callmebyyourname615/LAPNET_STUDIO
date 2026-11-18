# ປະຫວັດການໃຊ້ງານ — Audit Logs

ເປີດຜ່ານເມນູ **ປະຫວັດການໃຊ້ງານ** ໃນ Administration ຫຼື ປຸ່ມ Audit Logs ໃນແຖບເທິງ. Portal ໃຊ້ `/admin/audit`; Document ໃຊ້ `/document-workspace/portal/admin/audit` ໂດຍບໍ່ປ່ຽນ platform.

## ສິດ

ເບິ່ງໄດ້ສະເພາະບັນຊີ active ທີ່ມີ `portal_admin` ແບບ global ແລະ ຍັງຢູ່ໃນໄລຍະທີ່ມີຜົນ. API ກວດຜ່ານ `AuthorizationService.requireAdmin` ທຸກຄັ້ງ. CEO, CFO, manager, ສະມາຊິກພະແນກ Audit, scoped roles ຫຼື resource grants ບໍ່ໃຫ້ສິດນີ້. ການຖອນ role ປະຕິເສດຄຳຂໍຕໍ່ໄປທັນທີ; ໜ້າຈໍລ້າງລາຍການເມື່ອ API ຕອບ 403.

## ຂໍ້ມູນທີ່ເຫັນ

- ເວລາ, ຊື່ສະແດງ/username ປັດຈຸບັນ, User ID ຄົງທີ່, ກິດຈະກຳ, ຜົນລັບ, Target ID ແລະ Request ID.
- ຄົ້ນຫາດ້ວຍ action code ຫຼື UUID; ກັ່ນຕອງຜູ້ໃຊ້ດ້ວຍຊື່, username ຫຼື User ID, ປະເພດ, ຜົນລັບ ແລະ ຊ່ວງວັນ.
- ວັນທີອີງປີ Gregorian ແລະ ເວລາ Asia/Vientiane (UTC+07). ວັນສິ້ນສຸດໃນໜ້າຈໍລວມທັງວັນນັ້ນ. API ໃຊ້ `from` ແບບ inclusive ແລະ `to` ແບບ exclusive ເປັນ ISO timestamp.
- ໃໝ່ສຸດກ່ອນ, 25 ລາຍການຕໍ່ໜ້າ. Cursor ອີງ `(occurred_at,id)` ແທນ UUID ຢ່າງດຽວ, ເພື່ອບໍ່ຂ້າມຫຼືຊ້ຳເມື່ອມີລາຍການໃໝ່. ກົດໂຫຼດໃໝ່ເພື່ອເຫັນກິດຈະກຳທີ່ເພິ່ງເຂົ້າ.

## ຂອບເຂດການບັນທຶກ

ຮັກສາ business audit ເດີມທີ່ບັນທຶກໃນ transaction ດຽວກັບການແກ້ໄຂ: ບັນຊີ, ລະຫັດຜ່ານ, ພະແນກ, ບົດບາດ/ສິດ, ວຽກ, ເອກະສານ/ໂຟນເດີ/ໄຟລ໌, ບໍລິສັດ ແລະ ການຕິດຕໍ່. Login/logout, ການລອງ Login ບໍ່ສຳເລັດ ແລະ ການຈຳກັດ Login ຖືກບັນທຶກ.

ເພີ່ມ `activity.request` ສຳລັບ authenticated API handlers: ການອ່ານ/ຄົ້ນຫາ, ການປ່ຽນຂໍ້ມູນ ແລະ ຄຳຂໍທີ່ລົ້ມເຫຼວ/ຖືກປະຕິເສດ. ກວດຈາກ server session, method, route template, status ແລະ request ID; ບໍ່ເຊື່ອ actor ຈາກ client. ການອ່ານ audit ເອງກໍຖືກບັນທຶກ. ການປະຕິເສດ CSRF ຂອງບັນຊີທີ່ຢືນຢັນແລ້ວຖືກບັນທຶກດ້ວຍ. ບໍ່ບັນທຶກ successful session-refresh (`/me`), ການ fetch ຮູບ avatar/cover ແລະ static assets ຊ້ຳໆ. Request ແລະ business event ອາດເປັນສອງລາຍການທີ່ມີ Request ID ດຽວກັນ.

`activity.page_viewed` ເປັນການເປີດໜ້າທີ່ browser ລາຍງານຜ່ານ CSRF-protected endpoint; ແຍກຈາກ business events ທີ່ server ຢືນຢັນ. ບັນທຶກສະເພາະ application paths ທີ່ຍອມຮັບ, ບໍ່ເກັບ query string ຫຼື ການພິມ/ການເຄື່ອນ mouse. ລາຍການນີ້ອາດບໍ່ຮອດ server ເມື່ອ offline ຫຼື browser ຖືກປິດກະທັນຫັນ. Business events ບໍ່ອາໄສການລາຍງານນີ້.

ການ Login ບໍ່ສຳເລັດມີ actor ເປັນ null; ຊື່ທີ່ລອງ (`attemptedUsername`) ບໍ່ແມ່ນການຢືນຢັນຕົວຕົນ. ຂໍ້ມູນເກົ່າສະແດງຕາມ audit ທີ່ເຄີຍເກັບ; ບໍ່ສ້າງປະຫວັດຍ້ອນຫຼັງສຳລັບການອ່ານ/ເປີດໜ້າທີ່ບໍ່ເຄີຍບັນທຶກ.

## ການເກັບ ແລະ ທົດສອບ

ຕາຕະລາງ `audit_events` ຢູ່ PostgreSQL, ຮັກສາຂໍ້ມູນຫຼັງ restart ແລະ ລວມໃນ database backup. Runtime role ບໍ່ມີ UPDATE/DELETE/TRUNCATE; ບໍ່ມີ API ໃຫ້ແກ້/ລຶບ logs. Host/database administrators ຍັງມີອຳນາດຂອງຕົນໃນຖານຂໍ້ມູນ. Migration `202611180004_audit_logs` ເພີ່ມ outcome ແລະ indexes, ຮັກສາ events ເກົ່າ.

Audit ບໍ່ເກັບ password, cookie, token, request body, ຄຳຄົ້ນຫາ, ເນື້ອຫາໄຟລ໌ ຫຼື ເນື້ອຫາສ່ວນຕົວ. API ສົ່ງ metadata ສະເພາະ keys ທີ່ກຳນົດ ແລະ ຈຳກັດຂະໜາດ; ບໍ່ເປີດສິດອ່ານ business content ຜ່ານ logs.

`pnpm test:audit` ໃຊ້ database ຊົ່ວຄາວ ກວດ role boundary, revocation, request/page events, CSRF, redaction, filters, cursor ແລະ restart persistence. Browser validation ຢູ່ ignored `output/playwright/audit-browser-results.json`, ກວດ desktop/mobile, details/focus, error/retry, aborted stale responses ແລະ Document platform. ຊຸດ regression: `pnpm test:identity`, `pnpm test:tasks`, `pnpm test:documents`, `pnpm test:account`.
