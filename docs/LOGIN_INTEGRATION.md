# ການນຳໜ້າ Login ມາໃຊ້

> ອັບເດດຫຼ້າສຸດ 10 ພະຈິກ 2026: Login ສຳເລັດເຂົ້າ Dashboard ໄດ້ທັນທີ. ຜູ້ໃຊ້ຂໍເອົາໜ້າບັງຄັບປ່ຽນລະຫັດຜ່ານຄັ້ງທຳອິດອອກ; ບັນຊີໃໝ່, reset ແລະ ບັນຊີເກົ່າບໍ່ຖືກກັ້ນດ້ວຍ mustChangePassword ອີກ. ປ່ຽນລະຫັດຜ່ານໄດ້ໃນ `/account` ຕາມຄວາມຕ້ອງການ (6–128 ຕົວ). Username/Password, session, CSRF ແລະ resource permissions ຍັງກວດຈິງຕາມເດີມ. ຂໍ້ຄວາມ first-login gate ເກົ່າຂ້າງລຸ່ມເປັນປະຫວັດ.


> ອັບເດດ 10 ພະຈິກ 2026: ຕາມຄຳຂໍຫຼ້າສຸດ ໜ້າ Login ກວດ Username/Password ກັບ API ຈິງໃນທຸກໂໝດແລ້ວ. ເອົາການກົດຂ້າມແບບ preview ອອກ; `?auth=preview`, `VITE_ENABLE_UI_PREVIEW` ແລະ browser flags ເກົ່າບໍ່ສາມາດຂ້າມ Login. ສ່ວນອະທິບາຍ preview ເກົ່າຂ້າງລຸ່ມເປັນປະຫວັດການພັດທະນາ.
> ໃນ local HTTP development ຮອງຮັບ `localhost`, `127.0.0.1`, `[::1]` ສະເພາະ port ທີ່ຕັ້ງ `APP_ORIGIN`; ຍັງກວດ CSRF ແລະ ປະຕິເສດ cross-site. Production ເຊື່ອໃຈສະເພາະ HTTPS origin ທີ່ຕັ້ງໄວ້.


## ໂຄງສ້າງ

ໃຊ້ React + TypeScript + Tailwind CSS v4 ທີ່ມີຢູ່ແລ້ວ. `components.json` ຕັ້ງຄ່າ shadcn ໃຫ້ໃຊ້ `src/components/ui`; alias `@/` ຊີ້ໄປ `src/`.

| ໄຟລ໌ | ໜ້າທີ່ |
|---|---|
| `src/components/ui/sign-in-page.tsx` | component ໜ້າ Login ຕາມ prompt |
| `src/components/ui/demo.tsx` | ຕົວຢ່າງ standalone ທີ່ບໍ່ປອມການ Login ສຳເລັດ |
| `src/features/identity/Auth.tsx` | ເຊື່ອມ component ກັບ API ແລະ session |
| `src/main.tsx` | `BrowserRouter` ຂອງແອັບ; ບໍ່ຄອບ router ຊ້ອນກັນໃນໜ້າຈິງ |
| `src/index.css` | Tailwind, ຮູບແບບລວມ ແລະ Noto Sans Lao |
| `src/lib/utils.ts` | `cn` ຕາມໂຄງສ້າງ shadcn |

ການເກັບ component ໃນ folder ນີ້ເຮັດໃຫ້ alias imports ແລະ component ທີ່ເພີ່ມດ້ວຍ shadcn CLI ຢູ່ໃນມາດຕະຖານດຽວກັນ. ບໍ່ຈຳເປັນຕິດຕັ້ງ TypeScript/Tailwind ຊ້ຳ ຫຼື ສ້າງ Next.js project ໃໝ່.

ເພີ່ມ `lucide-react`, `react-router-dom`, `clsx` ແລະ `tailwind-merge` ດ້ວຍ version ທີ່ລັອກໄວ້ໃນ package/lockfile. ໃຊ້ Lucide ສຳລັບ Arrow/Eye/EyeOff ແລະ SVG ແບຣນຂອງ Google/GitHub ຕາມຕົວຢ່າງ.

## ການປັບຈາກຕົວຢ່າງ

- ປ່ຽນ email ເປັນ username ໃຫ້ກົງກັບລະບົບບັນຊີທີ່ໄດ້ຢືນຢັນ.
- ຮັບ `onSubmit` ແລະ `error` ຜ່ານ props; ເຊື່ອມ `/auth/login` ຈິງ. ບໍ່ມີ `console.log(formData)` ຫຼື ການເກັບ password ໃນ localStorage.
- ເລືອກຈື່ການເຂົ້າໃຊ້ຕາມ session policy ຂອງ server, ບໍ່ໄດ້ຈື່ password.
- ບໍ່ເປີດ signup ສາທາລະນະ. ປຸ່ມຂໍບັນຊີ/ລືມລະຫັດແຈ້ງວິທີຕິດຕໍ່ຜູ້ດູແລ.
- Google/GitHub ແລະ ເສັ້ນຄັ່ນຖືກເອົາອອກຕາມຄຳຂໍລ່າສຸດ.
- desktop ສະແດງຮູບດ້ານຊ້າຍ ແລະ ຟອມດ້ານຂວາ; ໜ້າຈໍນ້ອຍກວ່າ 768px ສະແດງຟອມເຕັມພື້ນທີ່ ແລະ ເລື່ອນໄດ້ເມື່ອຈຳເປັນ.
- label, password toggle, loading/error ແລະ ຂໍ້ຄວາມຊ່ວຍເຫຼືອເປັນພາສາລາວ.

ຮູບລ່າສຸດແມ່ນ `adrian-regeci-B9UKyWJ5l6k-unsplash.jpg` ທີ່ຜູ້ໃຊ້ສົ່ງໃຫ້, ເກັບໃນ `public/images/sign-in-macbook-dark.jpg`. ຮູບແມວມຸມລຸ່ມຂວາມາຈາກ `img_ref/images.jpeg`, ເກັບໃນ `public/images/login-cat.jpg`. ຟອນມາຈາກ [Google Fonts Noto Sans Lao](https://github.com/google/fonts/tree/main/ofl/notosanslao) ແລະ ມີ `public/fonts/OFL.txt` ກຳກັບ. ທັງຮູບ ແລະ ຟອນໃຫ້ບໍລິການຈາກ server ຂອງໂປຣເຈັກ.

## ໂໝດສະແດງຕົວຢ່າງຕາມຄຳຂໍລ່າສຸດ

ໃນ development, ປຸ່ມໜ້າ Login ເຂົ້າໜ້າຕົວຢ່າງໄດ້ທັນທີໂດຍບໍ່ກວດຊ່ອງກອກ. ບໍ່ສົ່ງ password ແລະ ບໍ່ສ້າງ server session. ໜ້າຈັດການໃນໂໝດນີ້ໃຊ້ຂໍ້ມູນຕົວຢ່າງ, ບໍ່ປ່ຽນບັນຊີ/ສິດຈິງ.

API ຈິງຍັງກວດບັນຊີ ແລະ ສິດ. Production build ບໍ່ເປີດໂໝດນີ້. ເພື່ອທົດສອບ Login ຈິງໃນ development, ໃຊ້ `/sign-in?auth=real` ຫຼື ຕັ້ງ `VITE_ENABLE_UI_PREVIEW=false` ແລ້ວຮັນ web ໃໝ່. ສະຖານະ preview ຢູ່ sessionStorage ເປັນ flag ທົ່ວໄປ; ບໍ່ເກັບ password ຫຼື token.

> Phase 03A: ບັນຊີຈິງໃຊ້ Tasks ທີ່ບັນທຶກໃນ PostgreSQL ແລ້ວ; ຂໍ້ຄວາມເກົ່າເລື່ອງວຽກຫາຍເມື່ອ refresh ໃຊ້ສະເພາະ preview. ເບິ່ງ [ສະຖານະ 03A](PHASE_03A_STATUS.md). real-mode selection ຖືກຈື່ໃນ tab; ກັບ preview ດ້ວຍ `/sign-in?auth=preview`.

ຜົນກວດ Login ຈິງ: browser 16 assertions ຜ່ານທັງ localhost/127.0.0.1 — ປະຕິເສດຊ່ອງວ່າງ/ລະຫັດຜິດ, ຮັບບັນຊີຖືກຕ້ອງ, ກວດ first-login password change, HttpOnly cookie, refresh ແລະ logout. Identity integration 16 checks ແລະ foundation 9 checks ຜ່ານ. ຫຼັກຖານ: `output/playwright/login-real-sunday-results.json`. ບໍ່ປ່ຽນລະຫັດຜ່ານ ຫຼື ສິດຂອງບັນຊີໃນການກວດນີ້.

ຫຼັກຖານຫຼັງເອົາ first-login gate ອອກ: browser 22 assertions ຜ່ານທັງ localhost/127.0.0.1. ບັນຊີ Sunday ເຂົ້າ Dashboard ໄດ້ທັນທີ, Tasks API ຕອບ 200, refresh ຄົງ session, ໜ້າ `/account` ຍັງມີການປ່ຽນລະຫັດແບບສະໝັກໃຈ ແລະ logout ໄດ້. Migration `202611100003_optional_password_change` ປັບ flag/default ແລະ ເກັບ audit; ບໍ່ປ່ຽນ password hash, ພະແນກ ຫຼື ສິດ.
