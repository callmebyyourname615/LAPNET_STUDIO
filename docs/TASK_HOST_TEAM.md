# Host, ທີມຮ່ວມວຽກ ແລະ Timeline

ອັບເດດ 18 ພະຈິກ 2026 ຕາມ workflow ທີ່ຜູ້ໃຊ້ຢືນຢັນ: ໜຶ່ງວຽກມີ Host ສ້າງວຽກ, ເຊີນຄົນ/ພະແນກ, ແລະທຸກຄົນຮ່ວມລາຍງານຄວາມຄືບໜ້າໃນວຽກດຽວກັນ.

## ວິທີໃຊ້

1. ກົດ **ສ້າງວຽກ**, ໃສ່ຫົວຂໍ້/ລາຍລະອຽດ ແລະເລືອກຜູ້ຮັບຜິດຊອບຫຼັກ. ຜູ້ສ້າງເປັນ Host.
2. ກົດ **ຈັດການມອບໝາຍ**. Tab **ລາຍບຸກຄົນ** ຄົ້ນຫາຊື່/username, ກອງຕາມພະແນກ, ເລືອກ **ຫຼັກ** (ຜູ້ຮັບຜິດຊອບ) ຫຼື **ຮ່ວມ** (ຜູ້ຮ່ວມວຽກ). Tab **ລາຍພະແນກ** ເລືອກພະແນກເຂົ້າທີມ. ກົດ **ນຳໃຊ້ການເລືອກ** ແລ້ວ **ບັນທຶກວຽກ** ຈຶ່ງສົ່ງການມອບໝາຍຈິງ; Cancel/Escape ຍົກເລີກການເລືອກໃນ overlay. ການເລືອກພະແນກບໍ່ປ່ຽນຜູ້ຮັບຜິດຊອບຫຼັກ.
3. ຄົນທີ່ເຊີນ ແລະສະມາຊິກປັດຈຸບັນຂອງພະແນກທີ່ tag ເຫັນວຽກໃນ **ວຽກຂອງຂ້ອຍ**. ປ່ຽນສະຖານະ, ແກ້ໄຂລາຍລະອຽດ ຫຼືເປີດ tab ຄວາມຄິດເຫັນເພື່ອ **ລາຍງານຄວາມຄືບໜ້າ**.
4. Host ໃຊ້ **ຈັດການທີມ** ເພື່ອເພີ່ມ/ເອົາສະມາຊິກອອກ. Host ຍັງໃຊ້ @tag ຄົນ/ພະແນກໃນ comment ເພື່ອເຊີນເຂົ້າທີມໄດ້. ຜູ້ຮ່ວມວຽກທົ່ວໄປ @tag ຄົນທີ່ມີສິດຢູ່ແລ້ວເພື່ອແຈ້ງເຕືອນ; ໃຫ້ Host ເປັນຜູ້ເຊີນຄົນໃໝ່.

Timeline ໃຊ້ `src/components/ui/timeline-3.tsx`: avatar/ຕົວຫຍໍ້ຈາກຊື່ຈິງ, ຜູ້ຂຽນ, ພະແນກ ແລະເວລາ Asia/Vientiane; ແບ່ງກຸ່ມມື້ນີ້/ມື້ວານ/ວັນທີ. ໃຊ້ comments API ເດີມ, ບໍ່ໃຊ້ຊື່/ຮູບ/ເຫດການຕົວຢ່າງ. ຜູ້ຂຽນແກ້ໄຂ ແລະເກັບ comment ຂອງຕົນເຂົ້າຄັງໄດ້ຕາມສິດ API.

ພິມ `@` ໃນຊ່ອງລາຍງານຄວາມຄືບໜ້າເພື່ອເປີດລາຍຊື່ຄົນ/ພະແນກຈາກ API. ພິມຕໍ່ເພື່ອຄົ້ນຫາ, ຄລິກ ຫຼືໃຊ້ ↑/↓ ແລ້ວ Enter ເພື່ອເລືອກ; Escape ປິດລາຍຊື່. ລຶບຊື່ອອກຈາກຂໍ້ຄວາມ ຫຼືກົດ × ຈະເອົາຜູ້ຮັບອອກດ້ວຍ. ຄຳຂໍເກົ່າຖືກ abort ເມື່ອຄົ້ນຫາໃໝ່; ຖ້າ API ຂັດຂ້ອງສາມາດລອງໃໝ່ໂດຍຂໍ້ຄວາມຍັງຢູ່.

ຜູ້ທີ່ມີສິດເບິ່ງ comment ເຫັນຮູບ avatar ຂອງຜູ້ຂຽນຜ່ານ `GET /api/v1/resources/:id/comments/:commentId/avatar?v=revision`. API ກວດ ACL ແລະ comment ທີ່ຍັງບໍ່ເຂົ້າຄັງທຸກຄັ້ງ, ສົ່ງຮູບ WebP ທີ່ normalize ແລ້ວ ພ້ອມ `private, no-store`. ບໍ່ມີຮູບຈະໃຊ້ຕົວຫຍໍ້. Account profile/cover ຍັງເປັນ self-only.

ປຸ່ມ **ເຊື່ອມເອກະສານ** ໃຊ້ Document Workspace API ເພື່ອແສດງເອກະສານທີ່ມີສິດເບິ່ງທັນທີ. ຄົ້ນຫາໄດ້ດ້ວຍຊື່ເອກະສານ, ຊື່ໄຟລ໌, ເລກທະບຽນ ແລະ `REG-…`; ເລືອກລາຍການແລ້ວກົດ **ບັນທຶກການເຊື່ອມ**. ມີ pagination, debounce/abort, ສະຖານະບໍ່ພົບ ແລະ retry. ປ່ຽນຄຳຄົ້ນຫາ/ໜ້າຈະລ້າງການເລືອກເກົ່າ. ການເຊື່ອມບໍ່ເພີ່ມສິດຂອງເອກະສານ. ກວດດ້ວຍ `pnpm test:documents`; Browser ທົດສອບຄົ້ນຫາ/ເລືອກ/ບັນທຶກ ແລະຈໍ 320–1440px ໃນ disposable DB. ຫຼັກຖານ `output/playwright/task-document-lookup-results.json` ແລະ `.local/traces/task-document-lookup.zip` (ignored).

ຖ້າວຽກຍັງບໍ່ມີເອກະສານທີ່ເຊື່ອມ ແລະ ມີສິດເບິ່ງ, tab ເອກະສານຈະເປີດຕົວເລືອກຈາກ Document tab ໃຫ້ຜູ້ມີສິດແກ້ໄຂໂດຍກົງ. ຍັງຕ້ອງເລືອກ ແລະ ບັນທຶກການເຊື່ອມ; ບໍ່ແນບເອກະສານທັງໝົດອັດຕະໂນມັດ. ກັບມາ focus ຈະໂຫຼດລາຍການໃໝ່ໂດຍຮັກສາຂໍ້ມູນໃນ form. ລິງກ໌ເອກະສານໃຊ້ `/document-workspace/:id` ເພື່ອເປີດ Document tab ຈິງ.

ອັບເດດ 19 ພະຈິກ 2026: ຜູ້ທີ່ມີສິດ **ເບິ່ງ Task** ອັບໂຫຼດໄຟລ໌ໃໝ່ເຂົ້າວຽກໄດ້ໂດຍກົງ ຜ່ານ tab ເອກະສານ → **ເລືອກໄຟລ໌** → **ອັບໂຫຼດເຂົ້າວຽກ**. ເລືອກຫຼາຍໄຟລ໌ໄດ້ (25 MiB ຕໍ່ໄຟລ໌); ຖ້າບາງໄຟລ໌ລົ້ມເຫຼວຈະເກັບສະເພາະໄຟລ໌ທີ່ຍັງບໍ່ສຳເລັດໄວ້. ເອກະສານໃໝ່ຈະປາກົດໃນ Document tab.

`POST /api/v1/tasks/:id/documents` ຮັບ `application/octet-stream`, URI-encoded `X-File-Name` (ບັງຄັບ), `X-Document-Title` ແລະ `X-Version-Note` (ບໍ່ບັງຄັບ). ກວດ session/CSRF/Task view ກ່ອນຮັບໄຟລ໌, lock Task ແລະກວດສິດຊ້ຳຫຼັງຮັບ bytes. ບັນທຶກ Resource, BusinessRecord (`parentId=Task`), DocumentMetadata, version, attachment link, history/audit ແລະ scan outbox ໃນ transaction ດຽວ. ລົ້ມເຫຼວຈະລຶບໄຟລ໌ຄ້າງ; ບໍ່ຕ້ອງ migration ໃໝ່.

ເອກະສານທີ່ອັບໂຫຼດຜ່ານ Task ໃຊ້ central authorization ຕາມ Task: view/download ຕາມສິດເບິ່ງ Task, edit/comment ຕາມສິດ Task, ບໍ່ອອກ independent sharing grants ໃຫ້ເອກະສານນີ້. ຜູ້ເຂົ້າທີມພາຍຫຼັງເຫັນໄຟລ໌ເກົ່າ; ຖອນສິດ/ປິດບັນຊີ/ເກັບ Task ເຂົ້າຄັງມີຜົນທັນທີ ເຖິງແມ່ນຜູ້ນັ້ນເຄີຍອັບໂຫຼດໄຟລ໌. ເອກະສານເດີມທີ່ເຊື່ອມຈາກ library ຍັງໃຊ້ ACL ເດີມ.

Timeline ເອກະສານໃຊ້ ReUI `src/components/reui/timeline.tsx`, ດຶງຜູ້ອັບໂຫຼດຈາກ version, ຊື່ໄຟລ໌, ສະບັບ, bytes, ສະຖານະ ແລະເວລາ DB ຈິງ (ແສດງ Asia/Vientiane). Desktop ສະຫຼັບຊ້າຍ/ຂວາ; mobile ຄໍລຳດຽວ. ໂຫຼດຂໍ້ມູນໃໝ່ເມື່ອ focus ແລະທຸກ 15 ວິນາທີທີ່ໜ້າຍັງເຫັນ, ໂດຍບໍ່ unmount form. ຍັງກວດ file signature/ZIP ແລະ ClamAV ຕາມລະບົບເດີມ; ເປີດ/ດາວໂຫຼດໄດ້ເມື່ອ available ເທົ່ານັ້ນ. ຕ້ອງຕັ້ງຄ່າ scanner ຈິງໃນ environment ກ່ອນໃຊ້ preview/download ຂອງໄຟລ໌ໃໝ່.

ກວດດ້ວຍ `pnpm test:documents`, identity/tasks/team/notifications/audit suites, TypeScript/lint/format/build ແລະ Playwright ສອງບັນຊີໃນ disposable DB. API test ຄອບຄຸມຖອນສິດກາງການຮັບ bytes ແລະກວດວ່າບໍ່ມີໄຟລ໌ຄ້າງ. ຫຼັກຖານ `output/playwright/task-upload-timeline-results.json` ແລະ `.local/traces/task-upload-timeline.zip` (ignored).

ກວດ autocomplete ດ້ວຍ `pnpm test:mentions`; API/ACL ດ້ວຍ `pnpm test:team` ແລະ `pnpm test:account`. Browser ທົດສອບສອງບັນຊີ, ເລືອກ tag, ລຶບ tag, retry ແລະຈໍ 320/375/768px; ຫຼັກຖານ `output/playwright/task-mentions-avatar-results.json` ແລະ `.local/traces/task-mentions-avatar.zip` (ignored).

## ກົດສິດ ແລະ persistence

- Assignment overlay ໃຊ້ Portal tokens ແລະ Radix Dialog (focus trap/restore, Escape, responsive). `GET /api/v1/tasks/options` ແສດງບັນຊີ active ທີ່ມີ username ໄດ້ທັນທີ, ຄົ້ນຫາຈາກ 1 ຕົວອັກສອນ, ມີ cursor/limit ≤25, `departmentId` ກອງຕາມ membership ປັດຈຸບັນ ແລະສົ່ງ username/ພະແນກເພື່ອແຍກຄົນຊື່ຄືກັນ. ເລືອກຜູ້ຮ່ວມວຽກ ≤25 ຄົນ ແລະ ≤25 ພະແນກ; ຜູ້ຮັບຜິດຊອບຫຼັກບໍ່ຊ້ຳກັບຜູ້ຮ່ວມວຽກ. API write ຍັງກວດ Host, account/department status ແລະ grants ຕາມກົດເດີມ. Browser ກວດດ້ວຍ disposable DB; ຫຼັກຖານ `output/playwright/task-assignment-results.json`, `.local/traces/task-assignment.zip` ແລະ `.local/TaskAssignmentPicker.preview.html` (8 states; ignored).

- Task ID ຍັງເປັນ Resource UUID. ບໍ່ມີ Project/Host hierarchy ໃໝ່.
- Host ເຊີນທີມໂດຍອອກ explicit `view`, `comment`, `edit` grants ໃນ transaction ດຽວກັບ task/history/audit. ໃຊ້ central authorization; ບໍ່ອະນຸຍາດໂດຍກວດ assignee ໃນ read query.
- Grants ອັດຕະໂນມັດມີ `source=task_team`. ເອົາຄົນ/ພະແນກອອກຈາກທີມຈະຖອນສະເພາະ grants ເຫຼົ່ານີ້; manual grants ແລະ scoped roles ຍັງຖືກກວດຕາມກົດເດີມ.
- ການປ່ຽນ membership/ປິດບັນຊີ/ຖອນ grant ມີຜົນທັນທີ. ການແກ້ metadata ບໍ່ສ້າງ grant ທີ່ຖືກຖອນຄືນ ແລະບໍ່ປ່ຽນ latest assigner.
- ສິດ `manage_access`, archive ແລະສິດເອກະສານເດີມຈາກ library ບໍ່ໄດ້ຮັບເພີ່ມຈາກການເຊີນ; ເອກະສານທີ່ອັບໂຫຼດໃນ Task ໃຊ້ສິດຕາມ Task ຕາມຂໍ້ກຳນົດໃໝ່ຂ້າງເທິງ.
- ການເຊີນຈາກ comment ໃຊ້ resource row lock, ເພີ່ມ revision, ບັນທຶກ `team_invited`, ແລະອອກ notification outbox. ຖ້າ mention ບໍ່ຖືກຕ້ອງ ໃຫ້ rollback ທັງ comment/team/history/grants.
- ບໍ່ backfill ສິດຈາກ assignments ຫຼື mentions ເກົ່າ. ສຳລັບວຽກເກົ່າ Host ປັບທີມເພື່ອເຊີນໃໝ່. ການ @tag ຂອງ resource ປະເພດອື່ນຍັງເປັນການແຈ້ງ, ບໍ່ແບ່ງປັນສິດ.

Migration: `202611180005_task_host_team`. ສຳຮອງ local DB ກ່ອນ migrate. ບໍ່ລຶບຂໍ້ມູນເກົ່າ.

ກວດດ້ວຍ `pnpm test:tasks`, `pnpm test:team`, `pnpm test:identity`, `pnpm test:documents`, `pnpm test:account`, `pnpm test:audit`, TypeScript, lint, format ແລະ build. Browser ທົດສອບ Host ສ້າງວຽກ/ເຊີນ, member ຂຽນຄວາມຄືບໜ້າ, Timeline ຈິງ ແລະຈໍ 320/375/768px ໃນ disposable DB. ຫຼັກຖານທ້ອງຖິ່ນ: `output/playwright/task-team-timeline-results.json` ແລະ `.local/traces/task-team-timeline.zip` (ignored).
