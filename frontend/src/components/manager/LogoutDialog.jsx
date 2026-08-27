import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function LogoutDialog({
  open,
  onCancel,
  onConfirm,
  description = "You will be signed out of the manager dashboard and returned to the PIN screen.",
}) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent
        data-testid="logout-dialog"
        style={{
          background: "var(--card)",
          border: "1px solid var(--line)",
          color: "var(--text)",
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif" style={{ color: "var(--gold)", fontSize: 22 }}>
            Do you want to logout?
          </AlertDialogTitle>
          <AlertDialogDescription style={{ color: "var(--muted)" }}>
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={onCancel}
            data-testid="logout-no-btn"
            style={{
              background: "transparent",
              border: "1px solid var(--line)",
              color: "var(--text)",
            }}
          >
            NO
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            data-testid="logout-yes-btn"
            style={{ background: "var(--red)", color: "white", border: "none" }}
          >
            YES
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
