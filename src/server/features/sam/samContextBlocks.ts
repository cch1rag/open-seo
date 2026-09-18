import { withPgClient } from "@/db";
import { ProjectContextService } from "@/server/features/project-context/services/ProjectContextService";
import { buildSamSystemPrompt } from "@/server/features/sam/samSystemPrompt";

/** The project fields SAM's context blocks render from. */
type SamBlockProject = {
  id: string;
  name: string;
  domain: string | null;
  locationCode: number;
  languageCode: string;
};

/**
 * The identity block. Runs through the context-block pipeline like the
 * project-memory block, so it re-renders (fresh project row, intake mode
 * on/off) whenever the prompt is refreshed.
 */
export function buildSoulPrompt(
  loadContext: () => Promise<{ project: SamBlockProject } | null>,
): Promise<string> {
  return withPgClient(async () => {
    const project = (await loadContext())?.project;
    if (!project) {
      return "You are SAM, the SEO agent inside OpenSEO. This chat session no longer exists; tell the user to start a new chat.";
    }
    const context = await ProjectContextService.getProjectContext(project.id);
    return buildSamSystemPrompt(
      {
        projectId: project.id,
        projectName: project.name,
        domain: project.domain,
        locationCode: project.locationCode,
        languageCode: project.languageCode,
      },
      // Nothing recorded about the business yet: SAM runs its intake flow.
      { intakeMode: context.missingSections.includes("business_overview") },
    );
  });
}

/**
 * The project-memory block. Scopes its own Postgres client: providers are
 * invoked from Think's internals, so no ambient withPgClient scope can be
 * assumed (no-op in D1 mode).
 */
export function renderProjectContext(
  loadContext: () => Promise<{ project: SamBlockProject } | null>,
): Promise<string | null> {
  return withPgClient(async () => {
    const project = (await loadContext())?.project;
    if (!project) return null;
    return ProjectContextService.renderProjectContextMarkdown(
      await ProjectContextService.getProjectContext(project.id),
    );
  });
}
