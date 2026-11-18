# Portal background refresh — 18 ພະຈິກ 2026

## ສາເຫດ ແລະ ການແກ້ໄຂ

Dashboard ໂຫຼດຂໍ້ມູນໃໝ່ເມື່ອ window ໄດ້ focus. `useTaskData` ເຄີຍລ້າງ data ໃນທຸກ reload; Dashboard ຈຶ່ງຖອດກາດ/ກຣາຟອອກ ແລ້ວສະແດງ Skeleton ກ່ອນສ້າງໃໝ່. ຜົນທີ່ເຫັນຄ້າຍການ refresh ໜ້າ, ແຕ່ບໍ່ແມ່ນ browser navigation loop.

- `src/features/tasks/api.ts`: ແຍກ initial/filter loading ຈາກ background refreshing. ເກັບ data ຂອງ URL/schema ເດີມໄວ້ລະຫວ່າງ reload; ບໍ່ປິດ auto refresh.
- `src/features/dashboard/Dashboard.tsx`: ບໍ່ຖອດກາດເມື່ອ refreshing. ປຸ່ມ refresh ບໍ່ສົ່ງຊ້ຳເມື່ອ pending; ຖ້າ background request ລົ້ມເຫຼວຊົ່ວຄາວ ໃຫ້ເຫັນຂໍ້ມູນຫຼ້າສຸດພ້ອມ retry.
- `src/features/identity/Auth.tsx`: ຖ້າ `/me` ບໍ່ປ່ຽນ ໃຫ້ຮັກສາ state identity ເດີມເພື່ອບໍ່ rerender ທັງ Portal. ກວດ session ເມື່ອ focus ແລະທຸກ 60 ວິນາທີຂະນະເຫັນໜ້າ; ບໍ່ polling ໃນ hidden tab.

URL/filter ໃໝ່ຍັງໃຊ້ shared Skeleton ແລະບໍ່ສະແດງ data ຈາກ scope ເກົ່າ. Abort request ທີ່ຖືກແທນ; response ເກົ່າບໍ່ສາມາດຂຽນທັບ filter ປັດຈຸບັນ. HTTP 401/403/404 ລ້າງ data ເກົ່າທັນທີ ແລະ error ຢຸດ Skeleton.

## ຫຼັກຖານ Playwright

Chrome, viewport 1440×1000, ບັນຊີທົດສອບຈິງໃນ disposable PostgreSQL ແລະ NestJS API. ບໍ່ປ່ຽນບັນຊີ/ວຽກຂອງຜູ້ໃຊ້. ການທົດສອບຈຳລອງ network latency 250ms ສະເພາະ browser route; app ບໍ່ມີ fake delay.

| ກວດ focus 3 ຄັ້ງ + idle 31 ວິນາທີ | ກ່ອນ | ຫຼັງ |
| --- | --- | --- |
| ຖອດ Dashboard content ອອກ | 3 | 0 |
| ແຊກ Dashboard Skeleton ໃໝ່ | 3 | 0 |
| ເກັບ Dashboard DOM node ເດີມ | ບໍ່ | ແມ່ນ |
| Browser exceptions | 0 | 0 |

Trace ຍັງເຫັນ `/me`/dashboard focus requests ແລະ notification polling ປົກກະຕິ. ໃນຊ່ວງກວດບໍ່ພົບ long task ຫຼື layout shift; ນີ້ເປັນ regression check ຂອງ refresh behavior.

ກວດເພີ່ມຜ່ານ 6 ກໍລະນີ: DOM/focus/scroll ຄົງເດີມ, HTTP 503 ເກັບ data, retry ຟື້ນຄືນ, HTTP 403 ລ້າງ data, filter ໃໝ່ໃຊ້ Skeleton, ແລະບໍ່ຮັບ response ຈາກ filter ເກົ່າ.

Local artifacts (ignored): `output/playwright/portal-refresh-{before,after,regressions}.json`, screenshots `portal-refresh-{before,after}.jpg`, traces `.local/traces/portal-refresh-{before,after,regressions}.zip`. Trace ເກັບໄວ້ທ້ອງຖິ່ນ.
