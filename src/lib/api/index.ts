import { accountApi } from "./account";
import { projectsApi } from "./projects";
import { structureApi } from "./structure";
import { workspaceApi } from "./workspace";
import { documentsApi } from "./documents";
import { charactersApi } from "./characters";
import { locationsApi } from "./locations";
import { packagesApi } from "./packages";

export { ApiError, isTauri, translateApiError } from "./client";

/**
 * Point d'accès unique de l'interface au noyau Rust.
 */
export const api = {
  ...accountApi,
  ...projectsApi,
  ...structureApi,
  ...workspaceApi,
  ...documentsApi,
  ...charactersApi,
  ...locationsApi,
  ...packagesApi,
};
