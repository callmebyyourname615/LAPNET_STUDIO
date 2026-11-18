# Host, ທີມຮ່ວມວຽກ ແລະ Timeline

ອັບເດດ 18 ພະຈິກ 2026 ຕາມ workflow ທີ່ຜູ້ໃຊ້ຢືນຢັນ: ໜຶ່ງວຽກມີ Host ສ້າງວຽກ, ເຊີນຄົນ/ພະແນກ, ແລະທຸກຄົນຮ່ວມລາຍງານຄວາມຄືບໜ້າໃນວຽກດຽວກັນ.

## ວິທີໃຊ້

1. ກົດ **ສ້າງວຽກ**, ໃສ່ຫົວຂໍ້/ລາຍລະອຽດ ແລະເລືອກຜູ້ຮັບຜິດຊອບຫຼັກ. ຜູ້ສ້າງເປັນ Host.
2. ຄົ້ນຫາເພື່ອເພີ່ມຜູ້ຮ່ວມວຽກ ຫຼືເລືອກ **@tag ພະແນກເຂົ້າທີມ**. ບັນທຶກແລ້ວເຂົ້າໃຊ້ຮ່ວມກັນໄດ້ເລີຍ; ບໍ່ຕ້ອງເລືອກ checkbox ແບ່ງປັນສິດອີກ.
3. ຄົນທີ່ເຊີນ ແລະສະມາຊິກປັດຈຸບັນຂອງພະແນກທີ່ tag ເຫັນວຽກໃນ **ວຽກຂອງຂ້ອຍ**. ປ່ຽນສະຖານະ, ແກ້ໄຂລາຍລະອຽດ ຫຼືເປີດ tab ຄວາມຄິດເຫັນເພື່ອ **ລາຍງານຄວາມຄືບໜ້າ**.
4. Host ໃຊ້ **ຈັດການທີມ** ເພື່ອເພີ່ມ/ເອົາສະມາຊິກອອກ. Host ຍັງໃຊ້ @tag ຄົນ/ພະແນກໃນ comment ເພື່ອເຊີນເຂົ້າທີມໄດ້. ຜູ້ຮ່ວມວຽກທົ່ວໄປ @tag ຄົນທີ່ມີສິດຢູ່ແລ້ວເພື່ອແຈ້ງເຕືອນ; ໃຫ້ Host ເປັນຜູ້ເຊີນຄົນໃໝ່.

Timeline ໃຊ້ `src/components/ui/timeline-3.tsx`: avatar/ຕົວຫຍໍ້ຈາກຊື່ຈິງ, ຜູ້ຂຽນ, ພະແນກ ແລະເວລາ Asia/Vientiane; ແບ່ງກຸ່ມມື້ນີ້/ມື້ວານ/ວັນທີ. ໃຊ້ comments API ເດີມ, ບໍ່ໃຊ້ຊື່/ຮູບ/ເຫດການຕົວຢ່າງ. ຜູ້ຂຽນແກ້ໄຂ ແລະເກັບ comment ຂອງຕົນເຂົ້າຄັງໄດ້ຕາມສິດ API.

## ກົດສິດ ແລະ persistence

- Task ID ຍັງເປັນ Resource UUID. ບໍ່ມີ Project/Host hierarchy ໃໝ່.
- Host ເຊີນທີມໂດຍອອກ explicit `view`, `comment`, `edit` grants ໃນ transaction ດຽວກັບ task/history/audit. ໃຊ້ central authorization; ບໍ່ອະນຸຍາດໂດຍກວດ assignee ໃນ read query.
- Grants ອັດຕະໂນມັດມີ `source=task_team`. ເອົາຄົນ/ພະແນກອອກຈາກທີມຈະຖອນສະເພາະ grants ເຫຼົ່ານີ້; manual grants ແລະ scoped roles ຍັງຖືກກວດຕາມກົດເດີມ.
- ການປ່ຽນ membership/ປິດບັນຊີ/ຖອນ grant ມີຜົນທັນທີ. ການແກ້ metadata ບໍ່ສ້າງ grant ທີ່ຖືກຖອນຄືນ ແລະບໍ່ປ່ຽນ latest assigner.
- ສິດ `manage_access`, archive ແລະສິດເອກະສານ/ໄຟລ໌ບໍ່ໄດ້ຮັບເພີ່ມຈາກການເຊີນ. ເອກະສານທີ່ເຊື່ອມກັບ task ຕ້ອງຜ່ານ ACL ຂອງເອກະສານດ້ວຍ.
- ການເຊີນຈາກ comment ໃຊ້ resource row lock, ເພີ່ມ revision, ບັນທຶກ `team_invited`, ແລະອອກ notification outbox. ຖ້າ mention ບໍ່ຖືກຕ້ອງ ໃຫ້ rollback ທັງ comment/team/history/grants.
- ບໍ່ backfill ສິດຈາກ assignments ຫຼື mentions ເກົ່າ. ສຳລັບວຽກເກົ່າ Host ປັບທີມເພື່ອເຊີນໃໝ່. ການ @tag ຂອງ resource ປະເພດອື່ນຍັງເປັນການແຈ້ງ, ບໍ່ແບ່ງປັນສິດ.

Migration: `202611180005_task_host_team`. ສຳຮອງ local DB ກ່ອນ migrate. ບໍ່ລຶບຂໍ້ມູນເກົ່າ.

ກວດດ້ວຍ `pnpm test:tasks`, `pnpm test:team`, `pnpm test:identity`, `pnpm test:documents`, `pnpm test:account`, `pnpm test:audit`, TypeScript, lint, format ແລະ build. Browser ທົດສອບ Host ສ້າງວຽກ/ເຊີນ, member ຂຽນຄວາມຄືບໜ້າ, Timeline ຈິງ ແລະຈໍ 320/375/768px ໃນ disposable DB. ຫຼັກຖານທ້ອງຖິ່ນ: `output/playwright/task-team-timeline-results.json` ແລະ `.local/traces/task-team-timeline.zip` (ignored).
