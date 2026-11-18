import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { createApplication } from "./app";

async function main() {
  // Offline schema generation never connects to a database.
  process.env.DATABASE_URL ??= "postgresql://offline:offline@127.0.0.1:1/offline";
  const app = await createApplication(undefined, false);
  try {
    const config = new DocumentBuilder()
      .setTitle("LAPNet Studio Portal API")
      .setDescription(
        "ລະບົບບັນຊີ, session, ອົງກອນ ແລະ ສິດເຂົ້າເຖິງໃນ Phase 02. ການມອບໝາຍວຽກ ແລະ ເອກະສານຈະເຊື່ອມໃນ phase ຕໍ່ໄປ.",
      )
      .setVersion("0.2.0")
      .addCookieAuth("lapnet_session", { type: "apiKey", in: "cookie" }, "cookie")
      .build();
    const document = SwaggerModule.createDocument(app, config);
    const directory = resolve(__dirname, "../../../../docs");
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, "openapi.json"), JSON.stringify(document, null, 2) + "\n");
    console.log("OpenAPI document generated.");
  } finally {
    await app.close();
  }
}
main().catch(() => {
  console.error("OpenAPI generation failed.");
  process.exitCode = 1;
});
