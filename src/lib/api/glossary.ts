import { call } from "./client";
import type { GlossaryInput, GlossaryTerm } from "@/types";

/** Glossaire du projet (voir `commands/glossary.rs`). */
export const glossaryApi = {
  /** Tous les termes, par ordre alphabétique. */
  listGlossaryTerms: (projectId: string) =>
    call<GlossaryTerm[]>("list_glossary_terms", { projectId }),

  createGlossaryTerm: (projectId: string, input: GlossaryInput) =>
    call<GlossaryTerm>("create_glossary_term", { projectId, input }),

  updateGlossaryTerm: (projectId: string, termId: string, input: GlossaryInput) =>
    call<GlossaryTerm>("update_glossary_term", { projectId, termId, input }),

  /** Met le terme à la corbeille ; renvoie l'identifiant de l'entrée. */
  deleteGlossaryTerm: (projectId: string, termId: string) =>
    call<string>("delete_glossary_term", { projectId, termId }),
};
