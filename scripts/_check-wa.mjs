// Quick diagnostic: check WA settings and user phones
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const settings = await prisma.setting.findMany({
    where: {
      OR: [
        { key: { startsWith: "wa.feature." } },
        { key: "wa.enabled" },
        { key: "wa.linkedJid" },
      ],
    },
    orderBy: { key: "asc" },
  });
  console.log("=== WA Settings ===");
  settings.forEach((s) => console.log(`${s.key} = ${s.value}`));

  const users = await prisma.user.findMany({
    select: { id: true, email: true, username: true, phone: true, status: true },
    take: 20,
    orderBy: { createdAt: "desc" },
  });
  console.log("\n=== Recent Users ===");
  users.forEach((u) =>
    console.log(
      `[${u.id}] ${u.email} (@${u.username}) phone=${u.phone ?? "<NULL>"} status=${u.status}`,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
