"use client";

import { useActionState, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { removeAvatarAction, updateAvatarAction } from "@/app/actions/settings";

/** Center-crops to a 256px square JPEG so the upload is tiny. */
async function toSquare(file: File): Promise<File> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  canvas.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
  if (!blob) throw new Error("resize failed");
  return new File([blob], "avatar.jpg", { type: "image/jpeg" });
}

export function AvatarForm({ name, src }: { name: string; src: string | null }) {
  const [state, action, pending] = useActionState(updateAvatarAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string>();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    setLocalError(undefined);
    try {
      const sq = await toSquare(f);
      const dt = new DataTransfer(); dt.items.add(sq);
      if (fileRef.current) fileRef.current.files = dt.files;
      setPreview(URL.createObjectURL(sq));
      formRef.current?.requestSubmit();
    } catch {
      setLocalError("Couldn't read that picture. Try a JPG or PNG.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar name={name} src={preview ?? src} size={72} />
      <div className="space-y-2">
        <form ref={formRef} action={action} className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} id="avatar-file" name="avatar" type="file" accept="image/*" className="sr-only" onChange={onPick} />
          <label htmlFor="avatar-file" className="btn btn-sm cursor-pointer"><Camera className="size-4" aria-hidden /> {pending ? "Uploading…" : src || preview ? "Change picture" : "Upload picture"}</label>
        </form>
        {(src || preview) && (
          <form action={removeAvatarAction}><button type="submit" className="text-xs text-slate-500 underline hover:text-neg" onClick={() => setPreview(null)}>Remove picture</button></form>
        )}
        {(localError || state?.error) && <p role="alert" className="text-xs text-neg">{localError ?? state?.error}</p>}
        {state?.ok && !localError && <p role="status" className="text-xs text-pos">{state.ok}</p>}
      </div>
    </div>
  );
}
