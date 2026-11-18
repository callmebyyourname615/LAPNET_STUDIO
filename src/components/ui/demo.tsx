import { BrowserRouter } from "react-router-dom";
import { useState } from "react";
import { LoginPage } from "@/components/ui/sign-in-page";

export default function Demo() {
  const [message, setMessage] = useState("");
  return (
    <BrowserRouter>
      <LoginPage
        error={message}
        onSubmit={async () => {
          setMessage("ນີ້ແມ່ນໜ້າຕົວຢ່າງ. ກະລຸນາໃຊ້ໜ້າເຂົ້າລະບົບຫຼັກ.");
        }}
      />
    </BrowserRouter>
  );
}
