import { Link } from "@tanstack/react-router";
import { ShieldAlert, Wrench } from "lucide-react";
import { GateCard } from "@/client/components/GateCard";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { isEveryAppClientAuthMode } from "@/lib/auth-mode";

export function SamSetupGate({
  errorMessage,
  isRefetching,
  onRetry,
  provider,
}: {
  errorMessage: string | null;
  isRefetching: boolean;
  onRetry: () => void;
  provider: "openrouter" | "openai-compatible" | null;
}) {
  const isOpenRouter = provider === "openrouter";
  return (
    <GateCard
      icon={Wrench}
      tone="warning"
      title="Enable AI Features"
      description={
        <>
          {!isOpenRouter ? (
            <p>
              SAM, OpenSEO&apos;s in-app AI agent, needs a valid AI provider
              configuration. Set the missing <code>AI_*</code> values in your{" "}
              <code>.env</code>, restart OpenSEO, then confirm here.
            </p>
          ) : isEveryAppClientAuthMode() ? (
            <p>
              SAM, OpenSEO&apos;s in-app AI agent, uses OpenRouter through your
              Every App gateway. An admin creates a key on OpenRouter and sets
              it on the gateway with{" "}
              <code>pnpm everyapp secret set OPENROUTER_API_KEY</code>, then
              confirm here.
            </p>
          ) : (
            <p>
              SAM, OpenSEO&apos;s in-app AI agent, needs an OpenRouter API key.
              Create a key on OpenRouter, set it as the{" "}
              <code>OPENROUTER_API_KEY</code> environment variable, restart
              OpenSEO, then confirm here.
            </p>
          )}
          {isOpenRouter ? (
            <p className="text-xs">
              Step-by-step instructions for every deployment are in the{" "}
              <Link
                className="underline underline-offset-2 hover:text-foreground"
                to="/help/openrouter-api-key"
              >
                OpenRouter API key setup guide
              </Link>
              .
            </p>
          ) : null}
        </>
      }
      actions={
        <>
          <Button size="lg" pending={isRefetching} onClick={onRetry}>
            {isOpenRouter ? "Confirm API Key" : "Confirm AI Setup"}
          </Button>
          {isOpenRouter ? (
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={
                <a
                  href="https://openrouter.ai/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              Open OpenRouter Keys
            </Button>
          ) : null}
        </>
      }
    >
      {errorMessage ? (
        <Alert variant="warning">
          <ShieldAlert />
          <AlertDescription className="text-foreground">
            {errorMessage}
          </AlertDescription>
        </Alert>
      ) : null}
    </GateCard>
  );
}
