import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <SignIn
      appearance={{
        elements: {
          rootBox: "w-full",
          card: "bg-card border border-border shadow-lg",
          headerTitle: "text-foreground",
          headerSubtitle: "text-muted-foreground",
          socialButtonsBlockButton:
            "bg-background border-border text-foreground hover:bg-muted",
          socialButtonsBlockButtonText: "text-foreground",
          dividerLine: "bg-border",
          dividerText: "text-muted-foreground",
          formFieldLabel: "text-foreground",
          formFieldInput: "bg-input border-border text-foreground",
          formButtonPrimary:
            "bg-primary hover:bg-primary/90 text-primary-foreground",
          footerActionLink: "text-primary hover:text-primary/80",
          identityPreviewText: "text-foreground",
          identityPreviewEditButton: "text-primary",
        },
      }}
    />
  );
}
