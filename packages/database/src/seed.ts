import { createDatabase } from "./index";

async function seed() {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL is required");
  const db = createDatabase(url);
  try {
    await db.$transaction(async (tx) => {
      const departments = new Map<string, string>();
      for (const name of ["Finance", "Office", "Operation", "IT", "Audit"]) {
        const row = await tx.department.upsert({
          where: { code: name.toUpperCase() },
          update: {},
          create: { code: name.toUpperCase(), name },
        });
        departments.set(name, row.id);
      }
      for (const [code, names] of [
        ["CEO", ["Finance", "Office"]],
        ["CFO", ["Operation", "IT"]],
        ["BOARD", ["Audit"]],
      ] as const) {
        const position = await tx.position.upsert({
          where: { code },
          update: {},
          create: { code, label: code === "BOARD" ? "Board" : code },
        });
        for (const name of names) {
          const departmentId = departments.get(name)!;
          if (!(await tx.reportingLine.findFirst({ where: { departmentId, effectiveTo: null } }))) {
            await tx.reportingLine.create({ data: { departmentId, positionId: position.id } });
          }
        }
      }
      const pairs = [
        ["IT", "Operation"],
        ["IT", "Finance"],
        ["IT", "Audit"],
        ["Office", "Finance"],
        ["Office", "Operation"],
        ["Office", "IT"],
        ["Office", "Audit"],
      ];
      for (const [a, b] of pairs) {
        const [departmentAId, departmentBId] = [departments.get(a)!, departments.get(b)!].sort();
        await tx.collaborationLink.upsert({
          where: { departmentAId_departmentBId: { departmentAId, departmentBId } },
          update: {},
          create: { departmentAId, departmentBId },
        });
      }
    });
    console.log(
      "Organization seeded: 5 departments, 3 positions, 5 reporting lines, 7 collaboration links; no employee accounts or business grants.",
    );
  } finally {
    await db.$disconnect();
  }
}
seed().catch(() => {
  console.error("Seed failed; no credentials were logged. Check migration configuration.");
  process.exitCode = 1;
});
