# Global toast feedback

`Toaster` mounts once in `src/main.tsx`, outside authentication and route transitions. Notifications render in a body portal above dialogs. Colors inherit the existing semantic status/surface/text tokens; toast spacing, durations, width, radius, shadow and layer are in `tokens.css`. Icons use `lucide-react`; entrance/exit animations use scoped GSAP contexts and respect reduced motion.

```ts
import { toast } from '@/lib/toast';

toast.success('ບັນທຶກສຳເລັດ.');
toast.error('ບໍ່ສາມາດບັນທຶກໄດ້.');
toast.warning('ກະລຸນາກວດສອບຂໍ້ມູນ.');
const id = toast.info('ສົ່ງເຂົ້າຄິວແລ້ວ.');
toast.dismiss(id);
```

`apiRequest` and `uploadFile` automatically report successful mutations and failed mutations, including folder deletion. Successful login and logout stay silent; logout clears existing notifications. Callers retain their inline validation/errors and original rejection behavior. Do not add a second toast for those requests. Background GET/HEAD requests and aborted requests stay silent. API messages follow the current document language (Lao by default, English when selected). Error messages never display raw response bodies or credentials.

There are at most four visible notifications; identical active messages are deduplicated. Status-tinted cards show only a bottom progress bar, without timer labels or countdown chips. A single GSAP clock drives progress and dismissal. Reduced motion steps the bar once per second instead of continuously animating it. Notifications close after five seconds (eight for errors); hovering or focusing does not pause the countdown. Users can close them manually; toast creation never takes focus. Individual cards announce status/error messages through live regions; the viewport itself is excluded from announcements to avoid duplicate reading.

Verify store behavior with `node --test src/lib/toast.test.ts`. Local browser audit results and screenshots are in `output/playwright/global-toast-results.json`, `global-toasts-desktop.png` and `global-toasts-mobile.png`.
