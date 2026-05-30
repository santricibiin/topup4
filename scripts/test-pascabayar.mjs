/**
 * Test API Pascabayar — login → inquiry → pay.
 *
 * Cara pakai:
 *   1. Pastikan dev server jalan: `npm run dev` (port 3000)
 *   2. Pastikan user test sudah punya saldo cukup (cek admin → users → adjust balance).
 *   3. Jalankan: node scripts/test-pascabayar.mjs
 *
 * Override via env:
 *   BASE_URL       (default http://localhost:3000)
 *   TEST_USER      (default admin)
 *   TEST_PASS      (default Admin#12345)
 *   TEST_SKU       (default post696106 — PLN Pascabayar)
 *   TEST_CUSTOMER  (default 530000000001 — nomor testing PLN dari docs Digiflazz)
 *   SKIP_PAY=1     (hanya inquiry, tidak bayar)
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const TEST_USER = process.env.TEST_USER ?? "admin";
const TEST_PASS = process.env.TEST_PASS ?? "Admin#12345";
const TEST_SKU = process.env.TEST_SKU ?? "post696106";
// Digiflazz mode development hanya menerima nomor pelanggan dummy.
// PLN Pascabayar: 530000000001 / 02 / 03 (Nama Pelanggan Pertama / Kedua / Ketiga).
const TEST_CUSTOMER = process.env.TEST_CUSTOMER ?? "530000000001";
const SKIP_PAY = process.env.SKIP_PAY === "1";

/** Simple cookie jar (cuma simpan name=value, ignore atribut). */
const cookies = new Map();

function setCookiesFromResponse(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const [name, ...rest] = pair.split("=");
    cookies.set(name.trim(), rest.join("=").trim());
  }
}

function cookieHeader() {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function call(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader(),
    },
    body: JSON.stringify(body),
  });
  setCookiesFromResponse(res);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function header(t) {
  console.log(`\n========== ${t} ==========`);
}

(async () => {
  header("1. LOGIN");
  const login = await call("/api/auth/login", {
    identifier: TEST_USER,
    password: TEST_PASS,
  });
  console.log("status:", login.status);
  console.log("body:", JSON.stringify(login.json, null, 2));
  if (!login.json.success) {
    console.error("❌ Login gagal — hentikan test.");
    process.exit(1);
  }

  header("2. INQUIRY (cek tagihan)");
  console.log(`SKU: ${TEST_SKU}  customerNo: ${TEST_CUSTOMER}`);
  const inq = await call("/api/transactions/inquiry", {
    productSku: TEST_SKU,
    customerNo: TEST_CUSTOMER,
  });
  console.log("status:", inq.status);
  console.log("body:", JSON.stringify(inq.json, null, 2));
  if (!inq.json.success) {
    console.error("❌ Inquiry gagal — hentikan test.");
    process.exit(1);
  }

  const orderId = inq.json.data.orderId;
  console.log(`✅ orderId = ${orderId}`);
  console.log(`   nama:    ${inq.json.data.customerName}`);
  console.log(`   total:   Rp ${Number(inq.json.data.billAmount).toLocaleString("id-ID")}`);

  if (SKIP_PAY) {
    console.log("\n(SKIP_PAY=1, tidak melanjutkan ke pay)");
    return;
  }

  header("3. PAY (bayar tagihan)");
  const pay = await call("/api/transactions/pay", { orderId });
  console.log("status:", pay.status);
  console.log("body:", JSON.stringify(pay.json, null, 2));
  if (!pay.json.success) {
    console.error("❌ Pay gagal.");
    process.exit(1);
  }

  console.log(`\n✅ Status akhir: ${pay.json.data.status}`);
  if (pay.json.data.providerSn) console.log(`   SN: ${pay.json.data.providerSn}`);
  if (pay.json.data.providerMessage) console.log(`   msg: ${pay.json.data.providerMessage}`);

  header("4. CEK TRANSAKSI");
  const detail = await fetch(`${BASE_URL}/api/transactions/${orderId}`, {
    headers: { Cookie: cookieHeader() },
  }).then((r) => r.json()).catch(() => null);
  if (detail) console.log(JSON.stringify(detail, null, 2));
})().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
