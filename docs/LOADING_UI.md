# Skeleton loading ແລະ GSAP shimmer

ທຸກຈຸດໂຫຼດຂໍ້ມູນໃຊ້ component ກາງ `src/components/ui/skeleton.tsx`. ໜ້າທີ່ຈະເພີ່ມໃໝ່ຕ້ອງໃຊ້ component ນີ້ເຊັ່ນກັນ.

| Variant | ການນຳໃຊ້ |
| --- | --- |
| `dashboard` | Bento cards ແລະ chart ທີ່ປັບຕາມຂະໜາດຈໍ |
| `page` | ໜ້າຜູ້ດູແລ ແລະ route ທົ່ວໄປ |
| `rows` | ລາຍການວຽກ, ປະຫວັດ, ລາຍການສິດ |
| `form` | ກວດບັນຊີ ແລະ ຂໍ້ມູນຕັ້ງຕົ້ນຂອງແບບຟອມ |
| `detail` | ລາຍລະອຽດລາຍການ |
| `card` | ຜົນຄົ້ນຫາຜູ້ໃຊ້/ຜູ້ຮັບສິດ |
| `inline` | ສະຖານະລໍຖ້າຂອງປຸ່ມ; ເກັບປ້າຍຊື່ປຸ່ມໄວ້ |

```tsx
import { Skeleton } from '@/components/ui/skeleton';

if (loading) return <Skeleton variant="rows" rows={3} />;
```

ສຳລັບ error ໃຫ້ຢຸດ Skeleton ແລ້ວສະແດງຂໍ້ຄວາມ ແລະ ປຸ່ມລອງໃໝ່. ຢ່າສະແດງ empty state ລະຫວ່າງໂຫຼດ, ຢ່າເພີ່ມ delay ປອມ, ແລະ ຢ່າລຶບຂໍ້ມູນຟອມທີ່ຜູ້ໃຊ້ກຳລັງປ້ອນ.

Shimmer ໃຊ້ `gsap.fromTo` ກັບ transform `xPercent`, ໃຊ້ `useGSAP` ແລະ scope ref ແຍກແຕ່ລະ instance. ບໍ່ animate width/height/background-position ແລະ ບໍ່ເພີ່ມ will-change ທົ່ວໜ້າ. `gsap.matchMedia` ປິດ animation ໃນ Reduced Motion; ຍັງເຫຼືອ placeholder ນິ່ງ. IntersectionObserver ແລະ visibilitychange ຢຸດການເຄື່ອນໄຫວເມື່ອບໍ່ເຫັນ. ເມື່ອ unmount ໃຫ້ revert tween ແລະ ຖອນ observer/listener.

ສະຖານະ loading ມີ role=status ແລະ ປ້າຍພາສາລາວສຳລັບ screen reader. ຮູບ placeholder ແມ່ນ aria-hidden. ປຸ່ມທີ່ລໍຖ້າຕ້ອງ disabled ເພື່ອບໍ່ໃຫ້ສົ່ງຊ້ຳ. ການໂຫຼດເບື້ອງຫຼັງເຊັ່ນ session refresh ບໍ່ຄວນເຊື່ອງໜ້າທີ່ໃຊ້ງານໄດ້.

ການກວດ browser ວັນທີ 10 ພະຈິກ 2026: ກວດ API ທີ່ລໍຖ້າ, error/retry, ຈໍ 320/375/768/1440px, ປ່ຽນ Reduced Motion ລະຫວ່າງໃຊ້ງານ, hidden tab, ແລະ ການນຳທາງກ່ອນ request ສຳເລັດ. ບົດລາຍງານຢູ່ `output/playwright/skeleton-results.json`; screenshot ຢູ່ `output/playwright/skeleton-dashboard-*.png`. ໄຟລ໌ເຫຼົ່ານີ້ແມ່ນ local artifacts ທີ່ບໍ່ commit.
