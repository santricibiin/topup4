import type { TicketFileInput } from "@/services/ticket.service";

/** Ambil semua field name="files" dari FormData → TicketFileInput[]. */
export async function collectTicketFiles(
  form: FormData,
): Promise<TicketFileInput[]> {
  const out: TicketFileInput[] = [];
  for (const f of form.getAll("files")) {
    if (!(f instanceof File)) continue;
    if (f.size === 0) continue;
    const buffer = Buffer.from(await f.arrayBuffer());
    out.push({
      buffer,
      mimeType: f.type || "application/octet-stream",
      size: f.size,
      originalName: f.name || "attachment",
    });
  }
  return out;
}
