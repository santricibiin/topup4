const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  try {
    const r = await p.setting.findMany({
      where: { key: { startsWith: "wa." } },
      orderBy: { key: "asc" },
    });
    r.forEach((x) =>
      console.log(
        x.key.padEnd(35),
        "=",
        x.value.length > 80 ? x.value.slice(0, 80) + "..." : x.value,
      ),
    );
    if (r.length === 0) console.log("(no wa.* settings found)");
  } catch (e) {
    console.error(e);
  } finally {
    await p.$disconnect();
  }
})();
