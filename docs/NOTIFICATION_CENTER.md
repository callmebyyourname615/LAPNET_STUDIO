# Notification center — 18 ພະຈິກ 2026

ກົດກະດິ່ງໃນ Portal ຫຼື Document ເພື່ອເປີດ preview ແຈ້ງເຕືອນ 6 ລາຍການ. **View all** ເປີດ inbox ເຕັມທີ່ `/notifications` ຫຼື `/document-workspace/portal/notifications` ຕາມ platform ປັດຈຸບັນ. ເປີດລາຍການແລ້ວຍັງຢູ່ໃນ platform ເດີມ.

- Preview ແລະ inbox ໃຊ້ຮູບແບບຈາກສອງ reference ຂອງຜູ້ໃຊ້, ພ້ອມສີ, ຟອນ ແລະ focus tokens ຂອງ Portal.
- ກັ່ນຕອງທັງໝົດ, ຍັງບໍ່ອ່ານ, @mentions ແລະວຽກຈາກ server. Inbox ແບ່ງໜ້າ 20 ລາຍການ. ແຜງຂ້າງສະແດງຈຳນວນຕາມປະເພດຈາກລະບົບ.
- ເມນູ `…` ເປີດລາຍການ ຫຼືໝາຍວ່າອ່ານແລ້ວ. ໜ້າ inbox ມີປຸ່ມອ່ານທັງໝົດ. ສະຖານະອ່ານບັນທຶກໃນ API ແລະອັບເດດ badge ຮ່ວມກັນ; ບໍ່ສະແດງ success toast ທຸກຄັ້ງທີ່ອ່ານ.
- ຊື່ຜູ້ກະທຳ, ພະແນກ, ເລກວຽກ ແລະຂໍ້ຄວາມຕົວຢ່າງມາຈາກຂໍ້ມູນຈິງ. Avatar ໃຊ້ຕົວຫຍໍ້ຊື່ຈິງ; ຖ້າບໍ່ຮູ້ຜູ້ກະທຳ ໃຊ້ icon ປະເພດແທນ. ບໍ່ເປີດສິດຮູບບັນຊີສ່ວນຕົວໃຫ້ຄົນອື່ນ.
- GSAP + `useGSAP` ເຄື່ອນໄຫວ transform/opacity ສະເພາະຕອນເປີດ–ປິດ preview ແລະເຂົ້າໜ້າ. ບໍ່ replay ເມື່ອ polling/focus refresh; ປິດ spatial motion ໃນ reduced-motion ແລະ cleanup ເມື່ອ unmount.
- Radix Popover ຈັດການ collision, ກົດນອກເພື່ອປິດ, Escape ແລະຄືນ focus ທີ່ກະດິ່ງ. ຂໍ້ມູນເກົ່າຍັງຢູ່ເມື່ອ background refresh; initial/filter loading ໃຊ້ shared Skeleton. Error ຢຸດ Skeleton ແລະມີ retry.

## API

`GET /api/v1/notifications?view=all|unread|mentions|tasks|comments&limit=20&cursor=…` ສົ່ງ `items`, `nextCursor`, `unread`, `total` ແລະ `counts`. `total`/`counts` ເປັນ inbox ທັງໝົດທີ່ຍັງມີສິດ; view/cursor ກັ່ນຕອງສະເພາະ `items`.

`POST /api/v1/notifications/:id/read` ແລະ `POST /api/v1/notifications/read-all` ກວດ session/Origin/CSRF, recipient ແລະ resource ACL. Read-all ບໍ່ໝາຍແຈ້ງເຕືອນທີ່ມາພາຍຫຼັງເວລາເລີ່ມ request. ຖອນສິດ resource ແລ້ວ ລາຍການ/metadata/counts ບໍ່ປາກົດ ແລະ read mutation ບໍ່ມີສິດຂຽນ.

Outbox payload ເພີ່ມສະເພາະ `actorId`; ບໍ່ສຳເນົາຂໍ້ຄວາມ comment. API ອ່ານ snippet ຈາກ comment ປັດຈຸບັນທີ່ບໍ່ archive ພາຍໃຕ້ resource ທີ່ມີສິດເບິ່ງ. ລາຍການເກົ່າຫາ actor ຈາກ task revision/comment ໄດ້ຖ້າມີ event key ທີ່ກົງກັນ. ບໍ່ຕ້ອງ database migration.

## ການກວດ

`pnpm test:notifications` ໃຊ້ disposable database: actor/snippet, worker, filter/cursor/count, CSRF/recipient, read-all, historical keys, archive ແລະ revoke. TypeScript, lint, format ແລະ production build ຜ່ານ.

Playwright: preview/View all, Portal + Document routes, ເປີດວຽກຈິງ, ໝາຍອ່ານ, ແບ່ງໜ້າ, empty/error/retry, Escape/focus, background refresh, reduced motion, ຈໍ 320/375/414/768px ແລະ desktop. Local ignored artifacts: `output/playwright/notification-results.json`, `notification-*.png` ແລະ `.local/traces/notifications.zip`. ບັນຊີ/ແຈ້ງເຕືອນທົດສອບຖືກລຶບພ້ອມ disposable DB; ບໍ່ປ່ຽນ inbox ຈິງ.
