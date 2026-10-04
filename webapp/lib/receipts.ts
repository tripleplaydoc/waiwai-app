import "server-only";
import type { Prisma } from "@prisma/client";

export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "application/pdf"]);

export type ReceiptInput = { bytes: Buffer; mimeType: string; fileName: string };

/** Pulls an optional receipt out of a form. Returns an error string for a bad file, null input when none was sent. */
export async function readReceipt(formData: FormData): Promise<{ error: string } | { input: ReceiptInput | null }> {
  const f = formData.get("receipt");
  if (!(f instanceof File) || f.size === 0) return { input: null };
  if (!ALLOWED.has(f.type)) return { error: "Receipts can be a photo (JPG, PNG, WebP, HEIC) or a PDF." };
  if (f.size > MAX_RECEIPT_BYTES) return { error: "That receipt is larger than 4 MB. Try a smaller photo or PDF." };
  return { input: { bytes: Buffer.from(await f.arrayBuffer()), mimeType: f.type, fileName: f.name.slice(0, 120) || "receipt" } };
}

/** One receipt per transaction: attaching again replaces the previous file. */
export async function saveReceipt(tx: Prisma.TransactionClient, workspaceId: string, transactionId: string, r: ReceiptInput) {
  const data = {
    workspaceId,
    transactionId,
    fileStorageKey: `db:${transactionId}`,
    mimeType: r.mimeType,
    fileSizeBytes: r.bytes.length,
    fileData: new Uint8Array(r.bytes),
    fileName: r.fileName,
    status: "PROCESSED" as const,
  };
  return tx.receipt.upsert({ where: { transactionId }, create: data, update: { ...data, uploadedAt: new Date() } });
}
