import { FileText } from "../icons";
import type { MsgAttachment } from "../store";

export function MessageAttachments({
  attachments,
}: {
  attachments?: MsgAttachment[];
}): JSX.Element | null {
  if (!attachments?.length) return null;

  return (
    <div className="msg__attachments flex min-w-0 flex-wrap justify-end gap-1.5">
      {attachments.map((attachment) =>
        attachment.kind === "file" ? (
          <span
            key={attachment.id}
            title={attachment.path}
            className="msg__file flex h-16 min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2"
          >
            <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="max-w-40 truncate text-xs text-muted-foreground">
              {attachment.name}
            </span>
          </span>
        ) : (
          <img
            key={attachment.id}
            src={attachment.url}
            alt="attachment"
            className="h-16 w-16 rounded-md border border-border object-cover"
          />
        ),
      )}
    </div>
  );
}
